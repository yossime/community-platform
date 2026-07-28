# 12 — Caching Strategy

> Redis caching patterns, TTL strategy, invalidation, and counter buffering

---

## 1. Overview

The platform uses **Upstash Redis** (serverless, Frankfurt region) for:

| Purpose | Pattern |
|---------|---------|
| Cache | Write-through + stale-while-revalidate |
| Rate limiting | Sliding window counters |
| Pub/sub | Socket.IO multi-instance coordination |
| Counters | Buffered increments (view counts, etc.) |
| Sessions | Short-lived data (typing indicators, OTP codes) |
| Queuing | BullMQ-compatible job queues (lightweight) |

---

## 2. Redis Client Setup

```typescript
// packages/cache/src/redis.ts
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
```

---

## 3. Caching Patterns

### 3.1 Pattern 1: Write-Through with Event-Based Invalidation

Used for: Forum lists, category trees, popular tags.

```
Read path:
  Client → tRPC → Check Redis → Cache HIT → Return
                               → Cache MISS → Query DB → Write to Redis → Return

Write path:
  Client → tRPC → Write to DB → Publish SNS event → Return
  SNS → SQS → Worker → Invalidate Redis cache key(s)
```

```typescript
// packages/cache/src/cache.ts

export async function cacheGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number,
): Promise<T> {
  // Try cache
  const cached = await redis.get<T>(key);
  if (cached !== null) return cached;

  // Cache miss — fetch from source
  const data = await fetcher();

  // Write to cache
  await redis.set(key, data, { ex: ttlSeconds });

  return data;
}

export async function cacheInvalidate(key: string): Promise<void> {
  await redis.del(key);
}

export async function cacheInvalidatePattern(pattern: string): Promise<void> {
  // Use SCAN to find matching keys (Upstash supports this)
  let cursor = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== 0);
}
```

### 3.2 Pattern 2: Tag-Based Invalidation

Used for: Content that belongs to multiple collections (e.g., a thread in a forum, a user's posts, a tag's threads).

Redis Sets group cache keys by tags, so invalidating a tag clears all related caches.

```typescript
// packages/cache/src/cache.ts

export async function cacheSet<T>(
  key: string,
  data: T,
  ttlSeconds: number,
  tags: string[] = [],
): Promise<void> {
  const pipeline = redis.pipeline();

  // Set the cache value
  pipeline.set(key, data, { ex: ttlSeconds });

  // Add key to each tag set
  for (const tag of tags) {
    pipeline.sadd(`tag:${tag}`, key);
    pipeline.expire(`tag:${tag}`, ttlSeconds + 60); // Tag set lives slightly longer
  }

  await pipeline.exec();
}

export async function invalidateByTag(tag: string): Promise<void> {
  const keys = await redis.smembers(`tag:${tag}`);
  if (keys.length > 0) {
    await redis.del(...keys, `tag:${tag}`);
  }
}

// Example usage:
// Cache a thread list — tagged by forum and author
await cacheSet(
  `forum:${forumId}:threads:page:${page}`,
  threads,
  60,
  [`forum:${forumId}`, `user:${authorId}:threads`],
);

// When a new thread is created in forum X:
await invalidateByTag(`forum:${forumId}`);
```

### 3.3 Pattern 3: Stale-While-Revalidate

Used for: Non-critical data (user profiles, stats) where serving slightly stale data is acceptable.

```typescript
// packages/cache/src/cache.ts

export async function cacheGetSWR<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number,
  staleSeconds: number, // How long stale data is acceptable
): Promise<T> {
  const cached = await redis.get<{ data: T; timestamp: number }>(`swr:${key}`);

  if (cached) {
    const age = (Date.now() - cached.timestamp) / 1000;

    if (age < ttlSeconds) {
      // Fresh — return immediately
      return cached.data;
    }

    if (age < ttlSeconds + staleSeconds) {
      // Stale but acceptable — return stale, revalidate in background
      revalidateInBackground(key, fetcher, ttlSeconds);
      return cached.data;
    }
  }

  // No cache or too stale — fetch synchronously
  const data = await fetcher();
  await redis.set(`swr:${key}`, { data, timestamp: Date.now() }, {
    ex: ttlSeconds + staleSeconds,
  });
  return data;
}

async function revalidateInBackground<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number,
): Promise<void> {
  // Fire and forget
  fetcher().then(async (data) => {
    await redis.set(`swr:${key}`, { data, timestamp: Date.now() }, {
      ex: ttlSeconds + 300,
    });
  }).catch(() => {
    // Ignore errors in background revalidation
  });
}
```

### 3.4 Pattern 4: Counter Buffering

Used for: High-frequency counters (view counts, impression counts) that would be too expensive to write directly to PostgreSQL on every hit.

```
Browser → tRPC → Redis INCR → Return
                     │
                     └─ Every 60 seconds (cron)
                        → Batch flush to PostgreSQL
                        → Redis DEL counter keys
```

```typescript
// packages/cache/src/cache.ts

// Increment a counter in Redis (fast, no DB write)
export async function incrementCounter(
  entityType: string,
  entityId: string,
  field: string,
): Promise<void> {
  const key = `counter:${entityType}:${entityId}:${field}`;
  await redis.incr(key);

  // Track which counters need flushing
  await redis.sadd("counter:pending", key);
}

// Flush all pending counters to PostgreSQL (called by cron every 60s)
export async function flushCounters(): Promise<void> {
  const pendingKeys = await redis.smembers("counter:pending");
  if (pendingKeys.length === 0) return;

  for (const key of pendingKeys) {
    const [, entityType, entityId, field] = key.split(":");
    const count = await redis.getdel<number>(key);

    if (count && count > 0) {
      // Batch update — use raw SQL for atomicity
      await db.$executeRaw`
        UPDATE "${Prisma.raw(getTableName(entityType))}"
        SET "${Prisma.raw(field)}" = "${Prisma.raw(field)}" + ${count}
        WHERE id = ${entityId}
      `;
    }
  }

  // Clear the pending set
  await redis.del("counter:pending");
}

function getTableName(entityType: string): string {
  const map: Record<string, string> = {
    thread: "Thread",
    post: "Post",
    article: "Article",
    portfolio_project: "PortfolioProject",
    classified: "ClassifiedListing",
    course: "Course",
    ad: "Ad",
  };
  return map[entityType] ?? entityType;
}
```

---

## 4. Cache Key Catalog

### 4.1 Forum & Threads

| Key Pattern | TTL | Tags | Invalidation |
|-------------|-----|------|-------------|
| `forum:categories` | 5 min | `forums` | On category CRUD |
| `forum:{forumId}:info` | 5 min | `forum:{forumId}` | On forum update |
| `forum:{forumId}:threads:page:{n}` | 60s | `forum:{forumId}` | On new thread |
| `thread:{threadId}:data` | 60s | `thread:{threadId}`, `forum:{forumId}` | On thread update, new post |
| `thread:{threadId}:posts:page:{n}` | 60s | `thread:{threadId}` | On new post |
| `thread:{threadId}:summary` | 24h | `thread:{threadId}` | On new post (invalidate) |
| `thread:{threadId}:postCount` | — | — | Counter buffer |
| `thread:{threadId}:viewCount` | — | — | Counter buffer |

### 4.2 Users & Profiles

| Key Pattern | TTL | Tags | Invalidation |
|-------------|-----|------|-------------|
| `user:{userId}:profile` | 5 min | `user:{userId}` | On profile update |
| `user:{userId}:reputation` | 10 min | `user:{userId}` | On reputation change |
| `user:{userId}:membership` | 5 min | `user:{userId}` | On subscription change |
| `user:{userId}:settings` | 5 min | `user:{userId}` | On settings update |
| `user:{userId}:interest_embedding` | 1h | `user:{userId}` | On new interactions |
| `user:{userId}:unread_count` | 30s | — | On new notification/message |

### 4.3 Marketplace

| Key Pattern | TTL | Tags | Invalidation |
|-------------|-----|------|-------------|
| `marketplace:projects:page:{n}` | 60s | `marketplace` | On new project |
| `project:{projectId}:data` | 5 min | `project:{projectId}` | On update |
| `freelancer:{userId}:profile` | 5 min | `freelancer:{userId}` | On profile update |
| `freelancer:{userId}:reviews` | 10 min | `freelancer:{userId}` | On new review |

### 4.4 Classifieds

| Key Pattern | TTL | Tags | Invalidation |
|-------------|-----|------|-------------|
| `classifieds:categories` | 5 min | `classifieds` | On category CRUD |
| `classifieds:{categorySlug}:page:{n}` | 60s | `classifieds:{categorySlug}` | On new listing |
| `classified:{listingId}:data` | 5 min | `classified:{listingId}` | On update |

### 4.5 Portfolios

| Key Pattern | TTL | Tags | Invalidation |
|-------------|-----|------|-------------|
| `portfolio:{username}:data` | 5 min | `portfolio:{userId}` | On portfolio update |
| `portfolio:showcase:page:{n}` | 60s | `portfolios` | On new project |

### 4.6 Courses

| Key Pattern | TTL | Tags | Invalidation |
|-------------|-----|------|-------------|
| `courses:catalog:page:{n}` | 5 min | `courses` | On new course |
| `course:{courseSlug}:data` | 5 min | `course:{courseId}` | On update |
| `enrollment:{enrollmentId}:progress` | 60s | `enrollment:{enrollmentId}` | On lesson completion |

### 4.7 Articles

| Key Pattern | TTL | Tags | Invalidation |
|-------------|-----|------|-------------|
| `articles:page:{n}` | 5 min | `articles` | On new article |
| `article:{slug}:data` | 5 min | `article:{articleId}` | On update |
| `articles:editors_picks` | 10 min | `articles` | On editor's pick toggle |

### 4.8 Search & Ads

| Key Pattern | TTL | Tags | Invalidation |
|-------------|-----|------|-------------|
| `search:suggest:{prefix}` | 5 min | `search` | On index update |
| `ads:placement:{type}:{forumId}` | 5 min | `ads` | On ad CRUD |

### 4.9 Platform-Wide

| Key Pattern | TTL | Tags | Invalidation |
|-------------|-----|------|-------------|
| `platform:stats` | 10 min | `stats` | On analytics rollup |
| `platform:popular_tags` | 1h | `tags` | On tag usage change |
| `platform:top_threads` | 5 min | `forums` | On thread activity |
| `sitemap:forums` | 6h | `forums` | On forum CRUD |
| `sitemap:articles` | 6h | `articles` | On article publish |

---

## 5. Rate Limiting

### 5.1 Sliding Window Algorithm

```typescript
// packages/cache/src/rate-limiter.ts

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp
}

export async function checkRateLimit(
  identifier: string,  // userId or IP
  category: string,    // "auth", "mutation", "query", etc.
  limit: number,       // max requests
  windowSeconds: number,
): Promise<RateLimitResult> {
  const key = `rate:${category}:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const pipeline = redis.pipeline();

  // Remove expired entries
  pipeline.zremrangebyscore(key, 0, windowStart);

  // Add current request
  pipeline.zadd(key, { score: now, member: `${now}:${Math.random()}` });

  // Count requests in window
  pipeline.zcard(key);

  // Set expiry on the key
  pipeline.expire(key, windowSeconds);

  const results = await pipeline.exec();
  const count = results[2] as number;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: Math.ceil((now + windowSeconds * 1000) / 1000),
  };
}
```

### 5.2 Rate Limit Categories

| Category | Limit | Window | Applies To |
|----------|-------|--------|------------|
| `auth` | 5 | 60s | Login, register, OTP |
| `auth:otp` | 3 | 300s | OTP verification attempts |
| `mutation` | 30 | 60s | All write operations |
| `query` | 100 | 60s | All read operations |
| `search` | 20 | 60s | Search queries |
| `upload` | 10 | 60s | File uploads |
| `message` | 30 | 60s | Send message |
| `webhook` | 500 | 60s | Stripe/WhatsApp webhooks |
| `admin` | 60 | 60s | Admin operations |
| `ai` | 10 | 60s | AI features (summarize, match) |
| `contact_reveal` | 5 | 3600s | Classified contact reveals |
| `data_export` | 1 | 86400s | IPPL data export |

---

## 6. Cache Warming

After each deployment and on a 30-minute schedule, warm frequently-accessed caches.

```typescript
// apps/web/app/api/cron/cache-warm/route.ts

export async function GET() {
  const warmTasks = [
    // Forum categories (every page load uses this)
    cacheGet("forum:categories", () =>
      db.forumCategory.findMany({
        include: { forums: { orderBy: { displayOrder: "asc" } } },
        orderBy: { displayOrder: "asc" },
      }),
      300, // 5 min
    ),

    // Popular tags
    cacheGet("platform:popular_tags", () =>
      db.tag.findMany({
        orderBy: { usageCount: "desc" },
        take: 50,
      }),
      3600,
    ),

    // Platform stats
    cacheGet("platform:stats", () =>
      db.$queryRaw`
        SELECT
          (SELECT COUNT(*) FROM "User" WHERE status = 'ACTIVE') AS "userCount",
          (SELECT COUNT(*) FROM "Thread") AS "threadCount",
          (SELECT COUNT(*) FROM "FreelancerProfile") AS "freelancerCount",
          (SELECT COUNT(*) FROM "ClassifiedListing" WHERE status = 'ACTIVE') AS "listingCount",
          (SELECT COUNT(*) FROM "Course" WHERE "isPublished" = true) AS "courseCount"
      `,
      600,
    ),

    // Top threads (homepage)
    cacheGet("platform:top_threads", () =>
      db.thread.findMany({
        where: { moderationStatus: "APPROVED" },
        orderBy: { lastPostAt: "desc" },
        take: 20,
        include: {
          author: { select: { displayName: true, avatarUrl: true, username: true } },
          forum: { select: { name: true, slug: true } },
        },
      }),
      300,
    ),
  ];

  await Promise.all(warmTasks);

  return Response.json({ status: "ok", warmed: warmTasks.length });
}
```

---

## 7. Memory & Performance

### 7.1 Estimated Redis Memory Usage

| Data Type | Est. Keys | Avg. Size | Total |
|-----------|----------|-----------|-------|
| Cache entries | ~5,000 | 2 KB | 10 MB |
| Counter buffers | ~10,000 | 50 B | 0.5 MB |
| Rate limit sorted sets | ~50,000 | 200 B | 10 MB |
| Tag sets | ~500 | 500 B | 0.25 MB |
| Pub/sub channels | ~100 | — | ~0 |
| Session data (OTPs, typing) | ~1,000 | 100 B | 0.1 MB |
| **Total** | | | **~21 MB** |

Upstash Pro plan (256 MB) provides ample headroom for Phase 1–2.

### 7.2 Performance Targets

| Operation | Target Latency |
|-----------|---------------|
| Cache GET (hit) | < 5ms |
| Cache SET | < 5ms |
| Rate limit check | < 10ms |
| Counter increment | < 5ms |
| Tag invalidation | < 20ms |
| Pattern invalidation (SCAN) | < 50ms |

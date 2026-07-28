# 07 — Search Architecture

> Meilisearch + pgvector hybrid search for Hebrew-first full-text and semantic search

---

## 1. Overview

The platform uses a **hybrid search** strategy:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Keyword search** | Meilisearch (self-hosted, 3-node cluster) | Full-text search with Hebrew support, typo tolerance, filters, facets |
| **Semantic search** | OpenAI embeddings + pgvector (Supabase) | Meaning-based search, AI matching, recommendations |
| **Autocomplete** | Meilisearch | Instant search-as-you-type suggestions |

---

## 2. Meilisearch Cluster

### 2.1 Infrastructure

```
┌───────────────────────────────────────────────┐
│           Internal ALB (eu-central-1)          │
│              meilisearch.internal              │
└───────────────────┬───────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
   ┌────▼────┐ ┌───▼─────┐ ┌──▼──────┐
   │ EC2 #1  │ │ EC2 #2  │ │ EC2 #3  │
   │r6g.large│ │r6g.large│ │r6g.large│
   │ (leader)│ │(follower)│ │(follower)│
   │         │ │         │ │         │
   │ 16GB RAM│ │ 16GB RAM│ │ 16GB RAM│
   │ 100GB   │ │ 100GB   │ │ 100GB   │
   │ gp3 SSD │ │ gp3 SSD │ │ gp3 SSD │
   └─────────┘ └─────────┘ └─────────┘
```

- **Version:** Meilisearch v1.6+
- **Instance type:** r6g.large (2 vCPU, 16 GB RAM) — ARM-based for cost efficiency
- **Storage:** 100 GB gp3 SSD per node
- **Network:** Private subnet, accessible only via internal ALB
- **Replication:** Leader-follower for read scaling

### 2.2 Configuration

```bash
# Meilisearch environment
MEILI_ENV=production
MEILI_MASTER_KEY=${MEILISEARCH_MASTER_KEY}
MEILI_DB_PATH=/var/lib/meilisearch/data
MEILI_DUMP_DIR=/var/lib/meilisearch/dumps
MEILI_HTTP_ADDR=0.0.0.0:7700
MEILI_MAX_INDEXING_MEMORY=12GiB
MEILI_MAX_INDEXING_THREADS=2
MEILI_LOG_LEVEL=INFO
```

---

## 3. Indexes (7 total)

### 3.1 Index Definitions

#### `threads` index

```typescript
// packages/search/src/indexes.ts

export const threadsIndex = {
  uid: "threads",
  primaryKey: "id",
  searchableAttributes: [
    "title",         // Highest priority
    "content",       // Thread body
    "authorName",    // Author display name
    "tags",          // Associated tags
  ],
  filterableAttributes: [
    "forumId",
    "forumSlug",
    "categorySlug",
    "authorId",
    "format",        // FLAT, THREADED, QA
    "status",        // OPEN, CLOSED, LOCKED
    "moderationStatus",
    "isPinned",
    "tags",
    "createdAt",
    "postCount",
  ],
  sortableAttributes: [
    "createdAt",
    "lastPostAt",
    "postCount",
    "viewCount",
  ],
  displayedAttributes: [
    "id", "title", "slug", "content", "authorId", "authorName",
    "authorAvatar", "forumId", "forumSlug", "forumName", "categorySlug",
    "format", "status", "isPinned", "tags", "postCount", "viewCount",
    "createdAt", "lastPostAt",
  ],
  typoTolerance: {
    minWordSizeForTypos: { oneTypo: 3, twoTypos: 6 },
  },
  pagination: { maxTotalHits: 5000 },
};
```

#### `articles` index

```typescript
export const articlesIndex = {
  uid: "articles",
  primaryKey: "id",
  searchableAttributes: [
    "title",
    "content",
    "excerpt",
    "authorName",
    "tags",
  ],
  filterableAttributes: [
    "categorySlug",
    "authorId",
    "isPublished",
    "isEditorsPick",
    "tags",
    "publishedAt",
  ],
  sortableAttributes: [
    "publishedAt",
    "viewCount",
    "likeCount",
    "commentCount",
  ],
  displayedAttributes: [
    "id", "title", "slug", "excerpt", "coverImageUrl", "authorId",
    "authorName", "authorAvatar", "categorySlug", "categoryName",
    "isEditorsPick", "tags", "viewCount", "likeCount", "commentCount",
    "publishedAt",
  ],
};
```

#### `freelancers` index

```typescript
export const freelancersIndex = {
  uid: "freelancers",
  primaryKey: "id",
  searchableAttributes: [
    "headline",
    "description",
    "displayName",
    "skills",
    "location",
  ],
  filterableAttributes: [
    "skills",
    "availability",   // AVAILABLE, BUSY, UNAVAILABLE
    "hourlyRateAgorot",
    "averageRating",
    "completedProjects",
    "location",
    "hasVerifiedBadge",
  ],
  sortableAttributes: [
    "averageRating",
    "completedProjects",
    "hourlyRateAgorot",
    "totalEarningsAgorot",
  ],
  displayedAttributes: [
    "id", "userId", "displayName", "username", "avatarUrl", "headline",
    "skills", "hourlyRateAgorot", "availability", "averageRating",
    "completedProjects", "location", "hasVerifiedBadge",
  ],
};
```

#### `classifieds` index

```typescript
export const classifiedsIndex = {
  uid: "classifieds",
  primaryKey: "id",
  searchableAttributes: [
    "title",
    "description",
    "location",
    "categoryName",
  ],
  filterableAttributes: [
    "categorySlug",
    "type",            // SELLING, BUYING, JOB_OFFER, etc.
    "status",          // ACTIVE
    "priceAgorot",
    "location",
    "isFeatured",
    "createdAt",
  ],
  sortableAttributes: [
    "createdAt",
    "priceAgorot",
    "viewCount",
    "isFeatured",
  ],
  displayedAttributes: [
    "id", "title", "slug", "description", "type", "priceAgorot",
    "priceLabel", "images", "location", "categorySlug", "categoryName",
    "authorName", "isFeatured", "viewCount", "createdAt",
  ],
};
```

#### `portfolios` index

```typescript
export const portfoliosIndex = {
  uid: "portfolios",
  primaryKey: "id",
  searchableAttributes: [
    "title",
    "description",
    "ownerName",
    "projects.title",
    "projects.description",
    "projects.tags",
    "projects.tools",
  ],
  filterableAttributes: [
    "ownerId",
    "projects.category",
    "projects.tags",
    "projects.tools",
    "visibility",
  ],
  sortableAttributes: [
    "viewCount",
    "likeCount",
    "updatedAt",
  ],
  displayedAttributes: [
    "id", "ownerId", "ownerName", "ownerUsername", "ownerAvatar",
    "title", "description", "projects", "viewCount", "likeCount",
  ],
};
```

#### `courses` index

```typescript
export const coursesIndex = {
  uid: "courses",
  primaryKey: "id",
  searchableAttributes: [
    "title",
    "description",
    "shortDescription",
    "instructorName",
    "tags",
  ],
  filterableAttributes: [
    "instructorId",
    "level",           // BEGINNER, INTERMEDIATE, ADVANCED
    "language",
    "priceAgorot",
    "isFree",
    "isPublished",
    "averageRating",
    "tags",
  ],
  sortableAttributes: [
    "createdAt",
    "priceAgorot",
    "averageRating",
    "enrollmentCount",
  ],
  displayedAttributes: [
    "id", "title", "slug", "shortDescription", "coverImageUrl",
    "instructorId", "instructorName", "instructorAvatar",
    "priceAgorot", "isFree", "level", "language",
    "averageRating", "enrollmentCount", "tags",
  ],
};
```

#### `users` index

```typescript
export const usersIndex = {
  uid: "users",
  primaryKey: "id",
  searchableAttributes: [
    "displayName",
    "username",
    "bio",
    "location",
    "skills",
  ],
  filterableAttributes: [
    "role",
    "location",
    "skills",
    "badgeLevel",
    "hasVerifiedBadge",
    "isFreelancer",
  ],
  sortableAttributes: [
    "totalScore",
    "createdAt",
  ],
  displayedAttributes: [
    "id", "displayName", "username", "avatarUrl", "bio",
    "location", "skills", "badgeLevel", "hasVerifiedBadge",
    "totalScore", "isFreelancer",
  ],
};
```

### 3.2 Index Summary

| Index | Est. Documents | Avg. Size | Searchable Fields | Filterable Fields |
|-------|---------------|-----------|-------------------|-------------------|
| `threads` | 500K | ~2 KB | 4 | 11 |
| `articles` | 50K | ~3 KB | 5 | 7 |
| `freelancers` | 10K | ~1 KB | 5 | 8 |
| `classifieds` | 100K | ~1.5 KB | 4 | 8 |
| `portfolios` | 20K | ~2 KB | 7 (nested) | 5 |
| `courses` | 5K | ~1.5 KB | 5 | 9 |
| `users` | 120K | ~0.5 KB | 5 | 6 |

**Total estimated index size:** ~2 GB RAM (fits in single r6g.large with headroom)

---

## 4. Search API

### 4.1 Unified Search (Single Index)

```typescript
// packages/api/src/routers/search.ts

search.query = publicProcedure
  .input(z.object({
    query: z.string().min(1).max(200),
    index: z.enum(["threads", "articles", "freelancers", "classifieds",
                    "portfolios", "courses", "users"]),
    filters: z.record(z.string()).optional(),
    sort: z.string().optional(),
    page: z.number().int().min(1).default(1),
    hitsPerPage: z.number().int().min(1).max(50).default(20),
  }))
  .query(async ({ input }) => {
    const index = meilisearch.index(input.index);

    const result = await index.search(input.query, {
      filter: buildFilterString(input.filters),
      sort: input.sort ? [input.sort] : undefined,
      page: input.page,
      hitsPerPage: input.hitsPerPage,
      attributesToHighlight: ["title", "content", "description"],
      highlightPreTag: "<mark>",
      highlightPostTag: "</mark>",
    });

    return {
      hits: result.hits,
      totalHits: result.totalHits,
      page: result.page,
      totalPages: result.totalPages,
      processingTimeMs: result.processingTimeMs,
    };
  });
```

### 4.2 Federated Multi-Index Search

```typescript
// Searches all indexes simultaneously
search.federated = publicProcedure
  .input(z.object({
    query: z.string().min(1).max(200),
    indexes: z.array(z.enum(["threads", "articles", "freelancers",
      "classifieds", "portfolios", "courses", "users"])).optional(),
  }))
  .query(async ({ input }) => {
    const targetIndexes = input.indexes ?? [
      "threads", "articles", "freelancers",
      "classifieds", "portfolios", "courses", "users",
    ];

    const result = await meilisearch.multiSearch({
      queries: targetIndexes.map((indexUid) => ({
        indexUid,
        q: input.query,
        limit: 5,
        attributesToHighlight: ["title", "content", "description"],
        highlightPreTag: "<mark>",
        highlightPostTag: "</mark>",
      })),
    });

    // Group results by index
    const grouped: Record<string, any[]> = {};
    for (const res of result.results) {
      grouped[res.indexUid] = res.hits;
    }

    return {
      results: grouped,
      totalProcessingTimeMs: result.results.reduce(
        (sum, r) => sum + r.processingTimeMs, 0
      ),
    };
  });
```

### 4.3 Autocomplete

```typescript
search.suggest = publicProcedure
  .input(z.object({
    query: z.string().min(1).max(100),
    index: z.enum(["threads", "articles", "freelancers",
      "classifieds", "portfolios", "courses", "users"]).default("threads"),
  }))
  .query(async ({ input }) => {
    const index = meilisearch.index(input.index);

    const result = await index.search(input.query, {
      limit: 8,
      attributesToRetrieve: ["id", "title", "slug", "displayName", "username"],
      attributesToHighlight: ["title", "displayName"],
      highlightPreTag: "<mark>",
      highlightPostTag: "</mark>",
    });

    return result.hits;
  });
```

---

## 5. Access Control in Search

### 5.1 Tenant Tokens

Meilisearch tenant tokens enforce search restrictions at the engine level, preventing users from accessing content they shouldn't see (private forums, gender-restricted content).

```typescript
// packages/search/src/client.ts
import { MeiliSearch, generateTenantToken } from "meilisearch";

export function createSearchToken(user: {
  id: string;
  gender: Gender;
  membershipTier: MembershipTier;
  role: Role;
}) {
  const searchRules: Record<string, any> = {
    threads: {
      filter: `moderationStatus = APPROVED AND (forumGenderRestriction IS NULL OR forumGenderRestriction = ${user.gender})`,
    },
    articles: {
      filter: "isPublished = true AND moderationStatus = APPROVED",
    },
    freelancers: {},
    classifieds: {
      filter: "status = ACTIVE AND moderationStatus = APPROVED",
    },
    portfolios: {
      filter: "visibility = PUBLIC",
    },
    courses: {
      filter: "isPublished = true",
    },
    users: {},
  };

  return generateTenantToken(
    process.env.MEILISEARCH_API_KEY_UID!,
    searchRules,
    {
      apiKey: process.env.MEILISEARCH_SEARCH_KEY!,
      expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
    }
  );
}
```

---

## 6. Semantic Search (pgvector)

### 6.1 Embedding Model

| Property | Value |
|----------|-------|
| Model | `text-embedding-3-small` (OpenAI) |
| Dimensions | 1536 |
| Cost | $0.02 per 1M tokens (~$0.00002 per embedding) |
| Stored in | `SearchEmbedding` table with pgvector extension |

### 6.2 Embedding Generation

```typescript
// packages/ai/src/embeddings/embedding-service.ts
import OpenAI from "openai";

const openai = new OpenAI();

export async function generateEmbedding(text: string): Promise<number[]> {
  // Truncate to ~8000 tokens (model limit)
  const truncated = text.slice(0, 30000);

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: truncated,
    dimensions: 1536,
  });

  return response.data[0].embedding;
}
```

### 6.3 Storing Embeddings

```sql
-- Enable pgvector extension (Supabase dashboard)
CREATE EXTENSION IF NOT EXISTS vector;

-- SearchEmbedding table (from Prisma + raw SQL for vector)
CREATE TABLE "SearchEmbedding" (
  id TEXT PRIMARY KEY,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  content TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- IVFFlat index for approximate nearest neighbor search
CREATE INDEX idx_search_embedding_vector
  ON "SearchEmbedding"
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE UNIQUE INDEX idx_search_embedding_entity
  ON "SearchEmbedding" ("entityType", "entityId");
```

### 6.4 Semantic Search Query

```typescript
// packages/api/src/routers/search.ts

search.semantic = membershipProcedure(["PROFESSIONAL", "BUSINESS", "ENTERPRISE"])
  .input(z.object({
    query: z.string().min(3).max(500),
    entityTypes: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(20).default(10),
  }))
  .query(async ({ ctx, input }) => {
    // 1. Generate query embedding
    const queryEmbedding = await generateEmbedding(input.query);

    // 2. pgvector cosine similarity search
    const results = await ctx.db.$queryRaw`
      SELECT
        "entityType",
        "entityId",
        content,
        1 - (embedding <=> ${queryEmbedding}::vector) AS similarity
      FROM "SearchEmbedding"
      WHERE 1 - (embedding <=> ${queryEmbedding}::vector) > 0.7
      ${input.entityTypes ? Prisma.sql`AND "entityType" = ANY(${input.entityTypes})` : Prisma.empty}
      ORDER BY embedding <=> ${queryEmbedding}::vector
      LIMIT ${input.limit}
    `;

    // 3. Hydrate results with full entities
    return hydrateSearchResults(results);
  });
```

### 6.5 Hybrid Search (Keyword + Semantic)

```typescript
search.hybrid = membershipProcedure(["PROFESSIONAL", "BUSINESS", "ENTERPRISE"])
  .input(z.object({
    query: z.string().min(1).max(200),
    index: z.enum(["threads", "articles", "freelancers"]),
    limit: z.number().int().min(1).max(20).default(10),
  }))
  .query(async ({ ctx, input }) => {
    // Run keyword and semantic search in parallel
    const [keywordResults, semanticResults] = await Promise.all([
      // Meilisearch keyword search
      meilisearch.index(input.index).search(input.query, { limit: input.limit }),
      // pgvector semantic search
      semanticSearch(ctx.db, input.query, input.index, input.limit),
    ]);

    // Reciprocal Rank Fusion (RRF) to merge results
    const k = 60; // RRF constant
    const scores = new Map<string, number>();

    keywordResults.hits.forEach((hit: any, rank: number) => {
      const id = hit.id;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });

    semanticResults.forEach((result: any, rank: number) => {
      const id = result.entityId;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });

    // Sort by combined RRF score
    const rankedIds = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, input.limit)
      .map(([id]) => id);

    // Hydrate
    return hydrateSearchResults(rankedIds, input.index);
  });
```

---

## 7. Indexing Pipeline

### 7.1 Event-Driven Incremental Sync

```
Content mutation (tRPC)
  → SNS content-events
    → SQS search-sync-queue
      → Search Indexer Lambda
        → Meilisearch upsert/delete
        → pgvector embedding upsert
```

### 7.2 Search Indexer Worker

```typescript
// workers/search-indexer/src/handler.ts
import { SQSHandler } from "aws-lambda";
import { meilisearch } from "@platform/search";
import { generateEmbedding } from "@platform/ai";
import { db } from "@platform/db";

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const message = JSON.parse(record.body);
    const { type, entityType, entityId } = message;

    switch (type) {
      case "CREATED":
      case "UPDATED": {
        const document = await fetchDocument(entityType, entityId);
        if (!document) break;

        // Upsert to Meilisearch
        const index = meilisearch.index(getIndexName(entityType));
        await index.addDocuments([document]);

        // Generate and store embedding (for embeddable types)
        if (["THREAD", "ARTICLE", "FREELANCER", "COURSE"].includes(entityType)) {
          const text = extractTextForEmbedding(document);
          const embedding = await generateEmbedding(text);
          await db.$executeRaw`
            INSERT INTO "SearchEmbedding" (id, "entityType", "entityId", embedding, content, "updatedAt")
            VALUES (gen_random_uuid(), ${entityType}, ${entityId}, ${embedding}::vector, ${text}, now())
            ON CONFLICT ("entityType", "entityId")
            DO UPDATE SET embedding = ${embedding}::vector, content = ${text}, "updatedAt" = now()
          `;
        }
        break;
      }

      case "DELETED": {
        const index = meilisearch.index(getIndexName(entityType));
        await index.deleteDocument(entityId);
        await db.searchEmbedding.deleteMany({
          where: { entityType, entityId },
        });
        break;
      }
    }
  }
};

function getIndexName(entityType: string): string {
  const map: Record<string, string> = {
    THREAD: "threads",
    ARTICLE: "articles",
    FREELANCER: "freelancers",
    CLASSIFIED: "classifieds",
    PORTFOLIO: "portfolios",
    COURSE: "courses",
    USER: "users",
  };
  return map[entityType] ?? "threads";
}
```

### 7.3 Bulk Reindex Script

```typescript
// workers/search-indexer/src/bulk-reindex.ts

async function bulkReindex(indexName: string) {
  const index = meilisearch.index(indexName);

  // Clear the index
  await index.deleteAllDocuments();

  // Batch fetch and index
  const batchSize = 1000;
  let cursor: string | undefined;

  while (true) {
    const documents = await fetchBatch(indexName, batchSize, cursor);
    if (documents.length === 0) break;

    await index.addDocuments(documents);
    cursor = documents[documents.length - 1].id;

    console.log(`Indexed ${documents.length} documents to ${indexName}`);
  }

  console.log(`Reindex complete for ${indexName}`);
}
```

---

## 8. Hebrew-Specific Configuration

| Feature | Configuration |
|---------|--------------|
| Language detection | Automatic (Meilisearch detects Hebrew) |
| Tokenization | Built-in Hebrew tokenizer (Charabia library) |
| Typo tolerance | Enabled: 1 typo for 3+ char words, 2 typos for 6+ char |
| Stop words | Hebrew stop words: של, את, על, עם, כי, אם, גם, הוא, היא, ... |
| RTL display | Handled by frontend, not search engine |
| Mixed content | Hebrew + English terms both searchable |
| Diacritics | Niqqud-insensitive (בְּרֵאשִׁית matches בראשית) |

```typescript
// Hebrew stop words configuration
await index.updateSettings({
  stopWords: [
    "של", "את", "על", "עם", "כי", "אם", "גם", "הוא", "היא", "אני",
    "הם", "הן", "לא", "כל", "מה", "זה", "זו", "אלה", "או", "כן",
    "עד", "רק", "בין", "כמו", "אחרי", "לפני", "בגלל", "כדי",
    "the", "a", "an", "is", "are", "was", "were", "in", "on", "at",
  ],
});
```

---

## 9. Performance Targets

| Metric | Target |
|--------|--------|
| Search latency (keyword) | < 50ms (p95) |
| Search latency (federated) | < 100ms (p95) |
| Search latency (semantic) | < 200ms (p95) |
| Indexing latency | < 2s from mutation to searchable |
| Autocomplete latency | < 30ms (p95) |
| Index freshness | < 5s for incremental sync |

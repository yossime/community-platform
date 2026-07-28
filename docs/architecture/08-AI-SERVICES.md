# 08 — AI Services

> Content moderation, image modesty compliance, matching, recommendations, and summarization

---

## 1. Overview

AI is used across the platform for five core purposes:

| Service | Model | Trigger | Priority |
|---------|-------|---------|----------|
| **Text moderation** | OpenAI Moderation API + GPT-4o-mini | Every UGC mutation | Critical |
| **Image modesty compliance** | GPT-4o Vision | Every image upload | Critical |
| **Embeddings** | text-embedding-3-small | Content creation/update | High |
| **Job matching** | pgvector cosine similarity | Project creation | Medium |
| **Thread summarization** | GPT-4o-mini | On demand (50+ posts) | Low |
| **Recommendations** | Collaborative filtering + embeddings | Feed generation | Low |

---

## 2. Content Moderation Pipeline

### 2.1 Three-Stage Pipeline

```
User submits content (text/image)
        │
        ▼
┌─────────────────────┐
│  Stage 1: Pre-proc   │
│  • HTML sanitization  │
│  • URL extraction     │
│  • Spam detection     │
│  • Rate limit check   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────────┐
│  Stage 2: AI Moderation  │
│                          │
│  Text:                   │
│  ├─ OpenAI Moderation API│ ◀── Free, fast (~100ms)
│  ├─ GPT-4o-mini classify │ ◀── Haredi-specific rules
│  └─ Confidence score     │
│                          │
│  Image:                  │
│  ├─ GPT-4o Vision        │ ◀── Modesty compliance
│  └─ ZERO tolerance       │
│                          │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│  Stage 3: Decision       │
│                          │
│  confidence ≥ 0.95:      │
│  ├─ APPROVED → publish   │
│  └─ REJECTED → notify    │
│                          │
│  confidence < 0.95:      │
│  └─ FLAGGED → human      │
│     review queue          │
└─────────────────────────┘
```

### 2.2 Text Moderation

```typescript
// packages/ai/src/moderation/text-moderator.ts
import OpenAI from "openai";

const openai = new OpenAI();

interface ModerationResult {
  status: "APPROVED" | "REJECTED" | "FLAGGED";
  confidence: number;
  categories: string[];
  reason?: string;
}

export async function moderateText(content: string): Promise<ModerationResult> {
  // Stage 1: OpenAI Moderation API (free, fast)
  const moderation = await openai.moderations.create({ input: content });
  const result = moderation.results[0];

  if (result.flagged) {
    const flaggedCategories = Object.entries(result.categories)
      .filter(([, flagged]) => flagged)
      .map(([category]) => category);

    return {
      status: "REJECTED",
      confidence: Math.max(...Object.values(result.category_scores)),
      categories: flaggedCategories,
      reason: `OpenAI moderation flagged: ${flaggedCategories.join(", ")}`,
    };
  }

  // Stage 2: Haredi-specific classification (GPT-4o-mini)
  const classification = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are a content moderator for a Haredi (ultra-Orthodox Jewish) professional community platform. Classify the following content.

Rules:
1. REJECT if content contains: explicit profanity, sexual content, promotion of activities against Halacha, missionary/proselytizing content, personal attacks or harassment, doxxing, scams or fraud
2. FLAG if content contains: borderline language, controversial religious opinions, political content that may cause division, commercial spam
3. APPROVE if content is: professional discussion, Torah/Halacha discussion, business inquiry, technical help, general community content

Respond with JSON: { "status": "APPROVED" | "REJECTED" | "FLAGGED", "confidence": 0.0-1.0, "categories": [], "reason": "brief explanation" }`,
      },
      { role: "user", content },
    ],
    response_format: { type: "json_object" },
    max_tokens: 200,
  });

  return JSON.parse(classification.choices[0].message.content!);
}
```

### 2.3 Spam Detection (Pre-Processing)

```typescript
// packages/ai/src/moderation/text-moderator.ts

interface SpamSignals {
  isSpam: boolean;
  score: number;
  signals: string[];
}

export function detectSpam(content: string, userId: string): SpamSignals {
  const signals: string[] = [];
  let score = 0;

  // URL density
  const urls = content.match(/https?:\/\/[^\s]+/g) ?? [];
  if (urls.length > 3) { signals.push("high_url_density"); score += 0.3; }

  // Repeated characters
  if (/(.)\1{5,}/.test(content)) { signals.push("repeated_chars"); score += 0.2; }

  // ALL CAPS (for Latin chars in mixed content)
  const latinChars = content.replace(/[^a-zA-Z]/g, "");
  if (latinChars.length > 10 && latinChars === latinChars.toUpperCase()) {
    signals.push("all_caps"); score += 0.1;
  }

  // Very short content with URL
  if (content.length < 50 && urls.length > 0) {
    signals.push("short_with_url"); score += 0.3;
  }

  // Phone number patterns (potential contact spam)
  const phoneNumbers = content.match(/0[5-9]\d[\s-]?\d{3}[\s-]?\d{4}/g) ?? [];
  if (phoneNumbers.length > 2) { signals.push("multiple_phones"); score += 0.2; }

  return {
    isSpam: score >= 0.6,
    score,
    signals,
  };
}
```

---

## 3. Image Modesty Compliance

### 3.1 Zero-Tolerance Policy

The Haredi community has strict modesty (tzniut) standards. **All images must be pre-screened before being publicly visible.** The modesty compliance check is the most critical AI feature on the platform.

**Rules:**
1. **ZERO tolerance** for images of women or girls — any detection results in immediate rejection
2. No immodest imagery of any kind
3. No images of mixed-gender social situations
4. Business/product/landscape/abstract images are always acceptable
5. Images of men in appropriate attire are acceptable

### 3.2 Image Moderation Flow

```
Image upload → Supabase Storage /temp/{uuid}
        │
        ▼
┌─────────────────────────────┐
│  SQS ai-moderation-queue     │
│  (message: IMAGE_UPLOADED)   │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  AI Worker (Lambda)          │
│                              │
│  1. Download from /temp/     │
│  2. Basic checks:            │
│     • File size ≤ 50MB       │
│     • Valid image format     │
│     • Not a known hash       │
│  3. GPT-4o Vision analysis   │
│  4. Decision                 │
│                              │
│  APPROVED:                   │
│  • Move to target bucket     │
│  • Update DB status          │
│  • Trigger media processing  │
│                              │
│  REJECTED:                   │
│  • Delete from /temp/        │
│  • Notify user               │
│  • Log to ModerationLog      │
│                              │
│  UNCERTAIN (conf < 0.95):    │
│  • Keep in /temp/ (hidden)   │
│  • Queue for human review    │
└─────────────────────────────┘
```

### 3.3 Image Analysis Implementation

```typescript
// packages/ai/src/moderation/image-moderator.ts
import OpenAI from "openai";

const openai = new OpenAI();

interface ImageModerationResult {
  status: "APPROVED" | "REJECTED" | "FLAGGED";
  confidence: number;
  reason: string;
  containsPeople: boolean;
  containsWomen: boolean;
}

export async function moderateImage(imageUrl: string): Promise<ImageModerationResult> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are an image moderator for a Haredi (ultra-Orthodox Jewish) community platform with strict modesty (tzniut) requirements.

Analyze this image and classify it according to these rules:

REJECT if the image:
- Contains any women or girls (regardless of attire) — ZERO TOLERANCE
- Contains immodest imagery of any kind
- Contains mixed-gender social situations
- Contains violence, gore, or disturbing content
- Contains religious imagery from other faiths used disrespectfully

FLAG (for human review) if:
- You are uncertain whether people in the image are male or female
- The image contains text that might be problematic
- The image is ambiguous in any way

APPROVE if the image:
- Is a product, landscape, building, abstract, or graphic
- Contains only men in appropriate attire (kippah, hat, suit, casual)
- Is a business logo, chart, diagram, or screenshot
- Is food, animals, or nature

Respond with JSON: { "status": "APPROVED" | "REJECTED" | "FLAGGED", "confidence": 0.0-1.0, "reason": "explanation", "containsPeople": bool, "containsWomen": bool }`,
      },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 300,
  });

  const result = JSON.parse(response.choices[0].message.content!);

  // Override: if containsWomen is true, ALWAYS reject regardless of confidence
  if (result.containsWomen) {
    return {
      ...result,
      status: "REJECTED",
      confidence: 1.0,
      reason: "Image contains women/girls — zero tolerance policy",
    };
  }

  return result;
}
```

### 3.4 Monthly Re-Scanning

5 % of previously approved images are re-scanned monthly to catch any that may have slipped through.

```typescript
// workers/ai-worker/src/rescan-images.ts (EventBridge scheduled, monthly)

export async function rescanApprovedImages() {
  // Randomly select 5% of approved images from last 6 months
  const images = await db.$queryRaw`
    SELECT pm.id, pm.url
    FROM "PortfolioMedia" pm
    WHERE pm."createdAt" > NOW() - INTERVAL '6 months'
    ORDER BY RANDOM()
    LIMIT (SELECT COUNT(*) * 0.05 FROM "PortfolioMedia"
           WHERE "createdAt" > NOW() - INTERVAL '6 months')
  `;

  for (const image of images) {
    const result = await moderateImage(image.url);
    if (result.status === "REJECTED") {
      // Flag for immediate review
      await db.moderationLog.create({
        data: {
          entityType: "PORTFOLIO_MEDIA",
          entityId: image.id,
          action: "RESCAN_FLAGGED",
          reason: result.reason,
          aiConfidence: result.confidence,
          isAutomatic: true,
          newStatus: "FLAGGED",
        },
      });
    }
  }
}
```

---

## 4. AI Job Matching

### 4.1 Matching Algorithm

When a client posts a project, the system finds the best matching freelancers using embedding similarity.

```typescript
// packages/ai/src/matching/job-matcher.ts

export async function findMatchingFreelancers(
  projectId: string,
  limit: number = 10,
): Promise<MatchResult[]> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { title: true, description: true, skills: true, budgetMinAgorot: true, budgetMaxAgorot: true },
  });

  // Generate project embedding
  const projectText = `${project.title}\n${project.description}\nSkills: ${project.skills.join(", ")}`;
  const projectEmbedding = await generateEmbedding(projectText);

  // Find nearest freelancer embeddings via pgvector
  const matches = await db.$queryRaw`
    SELECT
      se."entityId" AS "freelancerId",
      1 - (se.embedding <=> ${projectEmbedding}::vector) AS similarity,
      fp."hourlyRateAgorot",
      fp."averageRating",
      fp."completedProjects",
      fp.availability
    FROM "SearchEmbedding" se
    JOIN "FreelancerProfile" fp ON fp."userId" = se."entityId"
    WHERE se."entityType" = 'FREELANCER'
      AND fp.availability = 'AVAILABLE'
      AND 1 - (se.embedding <=> ${projectEmbedding}::vector) > 0.6
    ORDER BY
      -- Composite score: 60% similarity + 20% rating + 20% experience
      (1 - (se.embedding <=> ${projectEmbedding}::vector)) * 0.6 +
      (fp."averageRating" / 5.0) * 0.2 +
      LEAST(fp."completedProjects" / 50.0, 1.0) * 0.2
    DESC
    LIMIT ${limit}
  `;

  return matches.map((m: any) => ({
    freelancerId: m.freelancerId,
    similarity: m.similarity,
    hourlyRate: m.hourlyRateAgorot,
    averageRating: m.averageRating,
    completedProjects: m.completedProjects,
    availability: m.availability,
  }));
}
```

### 4.2 Notification on Match

When matches are found, the top 5 freelancers receive a notification.

```typescript
// After project creation & matching
const matches = await findMatchingFreelancers(projectId, 5);

for (const match of matches) {
  await sqs.sendMessage({
    QueueUrl: process.env.SQS_NOTIFICATION_QUEUE_URL!,
    MessageBody: JSON.stringify({
      type: "AI_JOB_MATCH",
      userId: match.freelancerId,
      data: { projectId, similarity: match.similarity },
      channels: ["IN_APP", "EMAIL"],
    }),
  });
}
```

---

## 5. Thread Summarization

### 5.1 When to Summarize

- Triggered on demand when user requests summary (PROFESSIONAL+ tier)
- Only available for threads with 50+ posts
- Cached for 24 hours, invalidated on new post

### 5.2 Implementation

```typescript
// packages/ai/src/summarization/thread-summarizer.ts

export async function summarizeThread(threadId: string): Promise<string> {
  // Check cache first
  const cached = await redis.get(`thread:${threadId}:summary`);
  if (cached) return cached;

  const thread = await db.thread.findUniqueOrThrow({
    where: { id: threadId },
    include: {
      posts: {
        where: { moderationStatus: "APPROVED" },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { displayName: true } } },
        take: 200, // Cap for token limits
      },
    },
  });

  if (thread.posts.length < 50) {
    throw new Error("Thread must have at least 50 posts for summarization");
  }

  // Format posts for the LLM
  const postsText = thread.posts
    .map((p, i) => `[${i + 1}] ${p.author.displayName}: ${p.content.slice(0, 500)}`)
    .join("\n\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You are summarizing a Hebrew-language forum thread for a professional community. Write the summary in Hebrew. Include:
1. Main topic and question (if any)
2. Key points discussed (3-5 bullet points)
3. Consensus or conclusion reached (if any)
4. Notable expert opinions
Keep it concise (200-300 words).`,
      },
      {
        role: "user",
        content: `Thread title: ${thread.title}\n\n${postsText}`,
      },
    ],
    max_tokens: 500,
  });

  const summary = response.choices[0].message.content!;

  // Cache for 24 hours
  await redis.set(`thread:${threadId}:summary`, summary, { ex: 86400 });

  return summary;
}
```

---

## 6. AI Recommendations

### 6.1 "What's New" Feed Algorithm

The personalized feed combines:
1. **Time decay** — newer content scores higher
2. **Collaborative filtering** — content liked/viewed by similar users
3. **Embedding similarity** — content similar to user's interests
4. **Engagement signals** — high view/reply/like ratios

```typescript
// packages/ai/src/recommendations/feed-recommender.ts

export async function getRecommendedFeed(
  userId: string,
  page: number = 1,
  limit: number = 20,
): Promise<FeedItem[]> {
  // 1. Get user's interest embedding (average of their interactions)
  const userEmbedding = await getUserInterestEmbedding(userId);

  // 2. Fetch candidate content from last 7 days
  const candidates = await db.$queryRaw`
    SELECT
      se."entityType",
      se."entityId",
      1 - (se.embedding <=> ${userEmbedding}::vector) AS similarity,
      EXTRACT(EPOCH FROM (NOW() - se."createdAt")) / 86400 AS age_days
    FROM "SearchEmbedding" se
    WHERE se."createdAt" > NOW() - INTERVAL '7 days'
      AND se."entityType" IN ('THREAD', 'ARTICLE', 'PORTFOLIO')
    ORDER BY
      -- Score = similarity * time_decay * engagement_boost
      (1 - (se.embedding <=> ${userEmbedding}::vector)) *
      (1.0 / (1.0 + EXTRACT(EPOCH FROM (NOW() - se."createdAt")) / 86400))
    DESC
    LIMIT ${limit}
    OFFSET ${(page - 1) * limit}
  `;

  return hydrateFeedItems(candidates);
}

async function getUserInterestEmbedding(userId: string): Promise<number[]> {
  const cacheKey = `user:${userId}:interest_embedding`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Average embeddings of user's recent interactions (views, likes, posts)
  const result = await db.$queryRaw`
    SELECT AVG(se.embedding) AS avg_embedding
    FROM "SearchEmbedding" se
    WHERE (
      se."entityId" IN (
        SELECT "threadId" FROM "Post" WHERE "authorId" = ${userId}
        UNION
        SELECT "projectId" FROM "PortfolioLike" WHERE "userId" = ${userId}
        UNION
        SELECT "entityId" FROM "SearchEmbedding"
        WHERE "entityType" = 'THREAD'
        AND "entityId" IN (SELECT "threadId" FROM "ThreadSubscription" WHERE "userId" = ${userId})
      )
    )
  `;

  const embedding = result[0]?.avg_embedding ?? await generateEmbedding("professional community");

  await redis.set(cacheKey, JSON.stringify(embedding), { ex: 3600 }); // 1 hour cache
  return embedding;
}
```

---

## 7. AI Worker Architecture

### 7.1 Lambda Configuration

```hcl
# infrastructure/terraform/lambda.tf (excerpt)

resource "aws_lambda_function" "ai_worker" {
  function_name = "platform-ai-worker"
  runtime       = "nodejs20.x"
  handler       = "handler.handler"
  timeout       = 300  # 5 minutes (image moderation can be slow)
  memory_size   = 512

  environment {
    variables = {
      OPENAI_API_KEY     = var.openai_api_key
      DATABASE_URL       = var.database_url
      REDIS_URL          = var.redis_url
      SUPABASE_URL       = var.supabase_url
      SUPABASE_KEY       = var.supabase_service_role_key
    }
  }

  reserved_concurrent_executions = 20  # Limit concurrent AI calls
}

resource "aws_lambda_event_source_mapping" "ai_worker_sqs" {
  event_source_arn = aws_sqs_queue.ai_moderation_queue.arn
  function_name    = aws_lambda_function.ai_worker.arn
  batch_size       = 5
}
```

### 7.2 SQS Message Schema

```typescript
interface AiModerationMessage {
  type: "TEXT_MODERATION" | "IMAGE_MODERATION" | "GENERATE_EMBEDDING" | "MATCH_JOBS" | "SUMMARIZE_THREAD";
  entityType: string;
  entityId: string;
  content?: string;      // For text moderation
  imageUrl?: string;     // For image moderation
  metadata?: Record<string, unknown>;
}
```

---

## 8. Cost Estimates

### 8.1 Per-Operation Costs

| Operation | Model | Cost per Call | Daily Volume (100K users) | Daily Cost |
|-----------|-------|-------------|--------------------------|------------|
| Text moderation (OpenAI) | Moderation API | Free | 50,000 | $0 |
| Text moderation (classify) | GPT-4o-mini | ~$0.001 | 50,000 | $5 |
| Image moderation | GPT-4o (low detail) | ~$0.005 | 5,000 | $2.50 |
| Embeddings | text-embedding-3-small | ~$0.00002 | 10,000 | $0.20 |
| Thread summarization | GPT-4o-mini | ~$0.005 | 500 | $2.50 |
| Job matching | pgvector (no API call) | $0 | 200 | $0 |
| Recommendations | pgvector (no API call) | $0 | 20,000 | $0 |

### 8.2 Monthly Cost Projection

| Phase | Daily Active Users | Est. Daily AI Cost | Monthly Cost |
|-------|-------------------|-------------------|--------------|
| Phase 1 (0-10K) | 2,000 | $3-5 | $90-150 |
| Phase 2 (10K-50K) | 10,000 | $10-15 | $300-450 |
| Phase 3 (50K-200K) | 50,000 | $15-25 | $450-750 |

---

## 9. Fallback & Error Handling

| Scenario | Fallback |
|----------|----------|
| OpenAI API down | Queue content as FLAGGED for human review |
| Rate limit hit | Exponential backoff with SQS visibility timeout |
| Moderation timeout | Default to FLAGGED (never auto-approve on error) |
| Embedding generation fails | Skip embedding, content still searchable via keyword |
| High confidence rejection | No human review needed, auto-reject |
| Image analysis ambiguous | Always err on side of caution → FLAGGED for human review |

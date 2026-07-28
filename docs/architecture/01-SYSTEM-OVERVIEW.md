# 01 — System Overview

> Kehila Community Platform — High-level architecture

---

## 1. Vision

A unified, RTL-first platform serving a Hebrew-speaking religious professional community: forums, freelance marketplace, portfolios, education, classifieds, articles, professional directory, real-time messaging, AI-powered features, and advertising — built as a modern replacement for legacy forum software.

---

## 2. Architecture Style — MACH

| Principle | Implementation |
|-----------|---------------|
| **Microservices** | Independently deployable services: web app, WebSocket server, AI workers, media processor, search indexer, notification worker, cron scheduler |
| **API-first** | tRPC for internal type-safe calls; versioned REST (`/api/v1/`) for public consumers |
| **Cloud-native** | Vercel (edge SSR), AWS ECS/Lambda (workers), Supabase (managed Postgres + Auth + Storage + Realtime), Upstash Redis |
| **Headless** | All business logic exposed via APIs; web and mobile apps are pure presentation layers |

---

## 3. System Context Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          INTERNET / CLIENTS                              │
│                                                                          │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                   │
│   │  Web Browser │   │  Mobile App │   │ 3rd-Party   │                   │
│   │  (Next.js)   │   │ (RN/Cap)    │   │ API Clients │                   │
│   └──────┬───────┘   └──────┬───────┘   └──────┬──────┘                  │
│          │                  │                   │                         │
└──────────┼──────────────────┼───────────────────┼────────────────────────┘
           │  HTTPS           │  HTTPS            │  REST /api/v1
           ▼                  ▼                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         EDGE / CDN LAYER                                 │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐    │
│   │                    Vercel Edge Network (fra1)                     │    │
│   │    ┌──────────────────────────────────────────────────────┐      │    │
│   │    │           Next.js App Router (SSR + API)             │      │    │
│   │    │                                                      │      │    │
│   │    │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │      │    │
│   │    │  │ App Pages│ │ tRPC     │ │ REST API │            │      │    │
│   │    │  │ (SSR/SSG)│ │ Handler  │ │ /api/v1/ │            │      │    │
│   │    │  └────┬─────┘ └────┬─────┘ └────┬─────┘            │      │    │
│   │    │       │            │             │                   │      │    │
│   │    │       └────────────┼─────────────┘                   │      │    │
│   │    │                    │                                 │      │    │
│   │    │              ┌─────▼──────┐                          │      │    │
│   │    │              │ Vercel Cron│                          │      │    │
│   │    │              │ Jobs       │                          │      │    │
│   │    │              └────────────┘                          │      │    │
│   │    └──────────────────────────────────────────────────────┘      │    │
│   └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
           │                    │                    │
           │ tRPC / Prisma      │ SNS publish        │ REST
           ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       BACKEND SERVICES                                   │
│                                                                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐             │
│  │  Supabase      │  │  AWS SNS       │  │  Upstash Redis │             │
│  │  ┌──────────┐  │  │  (Event Bus)   │  │  ┌──────────┐  │             │
│  │  │PostgreSQL│  │  │                │  │  │ Cache    │  │             │
│  │  │+ pgvector│  │  │  content-events│  │  │ Sessions │  │             │
│  │  │+ RLS     │  │  │  user-events   │  │  │ Rate-lim │  │             │
│  │  └──────────┘  │  │  payment-events│  │  │ Pub/Sub  │  │             │
│  │  ┌──────────┐  │  │                │  │  │ Counters │  │             │
│  │  │ Auth     │  │  └───────┬────────┘  │  └──────────┘  │             │
│  │  └──────────┘  │          │           └────────────────┘             │
│  │  ┌──────────┐  │          │                                          │
│  │  │ Storage  │  │          ▼                                          │
│  │  └──────────┘  │  ┌───────────────┐                                  │
│  │  ┌──────────┐  │  │  AWS SQS      │                                  │
│  │  │ Realtime │  │  │  Queues       │                                  │
│  │  └──────────┘  │  │               │                                  │
│  └────────────────┘  │  ai-moderation│                                  │
│                      │  search-sync  │                                  │
│                      │  notification │                                  │
│                      │  media-process│                                  │
│                      │  email-send   │                                  │
│                      └───────┬───────┘                                  │
│                              │                                          │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    AWS Workers (Lambda / ECS)                     │   │
│  │                                                                  │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │   │
│  │  │ AI Worker    │ │ Search       │ │ Notification │             │   │
│  │  │ (Lambda)     │ │ Indexer      │ │ Worker       │             │   │
│  │  │              │ │ (Lambda)     │ │ (Lambda)     │             │   │
│  │  │ • Moderation │ │              │ │              │             │   │
│  │  │ • Embeddings │ │ • Meilisearch│ │ • Email      │             │   │
│  │  │ • Matching   │ │   sync       │ │ • WhatsApp   │             │   │
│  │  │ • Summarize  │ │ • pgvector   │ │ • Push       │             │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │   │
│  │                                                                  │   │
│  │  ┌──────────────┐ ┌──────────────┐                               │   │
│  │  │ Media        │ │ WS Server    │                               │   │
│  │  │ Processor    │ │ (ECS Fargate)│                               │   │
│  │  │ (Lambda)     │ │              │                               │   │
│  │  │              │ │ • Socket.IO  │                               │   │
│  │  │ • Resize     │ │ • Typing     │                               │   │
│  │  │ • WebP       │ │ • Live chat  │                               │   │
│  │  │ • BlurHash   │ │ • Presence   │                               │   │
│  │  │ • Moderate   │ │              │                               │   │
│  │  └──────────────┘ └──────────────┘                               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌────────────────┐                                                     │
│  │  Meilisearch   │                                                     │
│  │  Cluster       │                                                     │
│  │  (3× EC2)      │                                                     │
│  │                │                                                     │
│  │  7 indexes     │                                                     │
│  │  Hebrew NLP    │                                                     │
│  └────────────────┘                                                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Service Map

| Service | Runtime | Responsibility | Scaling |
|---------|---------|---------------|---------|
| **Next.js Web App** | Vercel (fra1) | SSR pages, tRPC API, REST API, Vercel Cron | Auto (Vercel serverless) |
| **WebSocket Server** | ECS Fargate (eu-central-1) | Typing indicators, live marketplace chat, overflow real-time | Horizontal (Redis adapter) |
| **AI Worker** | AWS Lambda | Text moderation, image moderation, embeddings, matching, summarization | Concurrency-based |
| **Search Indexer** | AWS Lambda | Incremental Meilisearch sync, pgvector embedding writes | SQS-triggered |
| **Notification Worker** | AWS Lambda | Email (Resend/SES), WhatsApp (Cloud API), push notifications | SQS-triggered |
| **Media Processor** | AWS Lambda | Image resize, WebP convert, BlurHash, EXIF strip, watermark | SQS-triggered |
| **Cron Scheduler** | Vercel Cron + EventBridge | Digest emails, stale listing cleanup, analytics rollup, cache warming | Time-based |
| **Meilisearch Cluster** | EC2 (3× r6g.large) | Full-text search across 7 indexes, Hebrew NLP | Internal ALB |

---

## 5. Inter-Service Communication

### 5.1 Synchronous (Request-Response)

| Pattern | Usage | Protocol |
|---------|-------|----------|
| **tRPC** | Web app ↔ API logic (packages/api) | HTTP POST, batched, type-safe |
| **REST** | Public API consumers, webhooks | HTTP GET/POST, versioned `/api/v1/` |
| **Prisma** | API logic ↔ PostgreSQL | TCP, connection pooling via Supabase PgBouncer |
| **Meilisearch HTTP** | Search router → Meilisearch cluster | HTTP, internal ALB |

### 5.2 Asynchronous (Fire-and-Forget)

| Pattern | Usage | Transport |
|---------|-------|-----------|
| **SNS → SQS fan-out** | Content mutations broadcast to multiple workers | AWS SNS topics → SQS subscriptions |
| **SQS direct** | Targeted async jobs (email send, image process) | AWS SQS queues with DLQs |
| **Redis pub/sub** | WebSocket server multi-instance coordination | Upstash Redis |

### 5.3 Real-Time (Persistent Connections)

| Pattern | Usage | Transport |
|---------|-------|-----------|
| **Supabase Realtime** | Live post/message updates, notification badges, presence | WebSocket (Supabase managed) |
| **Socket.IO** | Typing indicators, marketplace live chat | WebSocket (ECS Fargate) |

---

## 6. SNS Topics

| Topic | Publishers | Subscribers (SQS) |
|-------|-----------|-------------------|
| `content-events` | Next.js app (on create/update/delete of any UGC) | `ai-moderation-queue`, `search-sync-queue` |
| `user-events` | Next.js app (on registration, profile update, verification) | `search-sync-queue`, `notification-queue` |
| `payment-events` | Stripe webhook handler | `notification-queue`, `email-send-queue` |

---

## 7. SQS Queues

| Queue | Consumer | DLQ | Visibility Timeout | Max Retries |
|-------|----------|-----|-------------------|-------------|
| `ai-moderation-queue` | AI Worker (Lambda) | `ai-moderation-dlq` | 300s | 3 |
| `search-sync-queue` | Search Indexer (Lambda) | `search-sync-dlq` | 60s | 5 |
| `notification-queue` | Notification Worker (Lambda) | `notification-dlq` | 30s | 3 |
| `media-processing-queue` | Media Processor (Lambda) | `media-processing-dlq` | 120s | 3 |
| `email-send-queue` | Notification Worker (Lambda) | `email-send-dlq` | 30s | 5 |

---

## 8. Environment Overview

```
┌─────────────────────────────────────────────────┐
│                  Region: eu-central-1            │
│                  (Frankfurt)                     │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Vercel   │  │ Supabase │  │ AWS          │  │
│  │ (fra1)   │  │ (Frank.) │  │ (eu-cent-1)  │  │
│  │          │  │          │  │              │  │
│  │ Next.js  │  │ Postgres │  │ ECS Fargate  │  │
│  │ SSR      │  │ Auth     │  │ Lambda ×4    │  │
│  │ API      │  │ Storage  │  │ SQS ×5+DLQs  │  │
│  │ Cron     │  │ Realtime │  │ SNS ×3       │  │
│  │          │  │          │  │ EventBridge  │  │
│  └──────────┘  └──────────┘  │ EC2 ×3 (MS)  │  │
│                               └──────────────┘  │
│  ┌──────────┐                                    │
│  │ Upstash  │                                    │
│  │ Redis    │                                    │
│  │ (Frank.) │                                    │
│  └──────────┘                                    │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## 9. Data Flow Examples

### 9.1 User Creates a Forum Post

```
Browser → Vercel (tRPC post.create)
  → Prisma INSERT post (moderationStatus: PENDING)
  → Redis INCR thread:{id}:postCount
  → SNS publish content-events { type: POST_CREATED, postId }
  → Return post to client (optimistic UI)

SNS fans out:
  → SQS ai-moderation-queue
    → AI Worker: OpenAI Moderation API → GPT-4o-mini classify
    → Prisma UPDATE post.moderationStatus = APPROVED / FLAGGED
    → If APPROVED: Supabase Realtime broadcast to thread channel
    → If FLAGGED: insert into ModerationLog for human review

  → SQS search-sync-queue
    → Search Indexer: upsert into Meilisearch `threads` index
    → Generate embedding → pgvector INSERT
```

### 9.2 Marketplace Project Payment

```
Client → tRPC marketplace.fundMilestone
  → Stripe PaymentIntent.create (capture_method: manual)
  → Prisma UPDATE transaction.status = PENDING_FUNDING
  → Stripe confirm → webhook payment_intent.succeeded
  → Prisma UPDATE transaction.status = FUNDED → IN_ESCROW
  → SNS payment-events { type: MILESTONE_FUNDED }
  → Notification Worker → WhatsApp + email to freelancer

Freelancer delivers → Client approves
  → tRPC marketplace.releaseMilestone
  → Stripe Transfer.create (to freelancer's Connect account)
  → Platform fee deducted (10-15%)
  → Prisma UPDATE transaction.status = RELEASED
```

### 9.3 Image Upload (Portfolio)

```
Browser → tRPC media.getSignedUrl({ bucket: 'temp', type: 'image/jpeg' })
  → Supabase Storage signed URL returned

Browser → Direct upload to Supabase Storage /temp/{uuid}
  → tRPC media.confirmUpload({ tempPath, targetBucket: 'portfolio' })
  → SNS content-events { type: IMAGE_UPLOADED, path }

  → SQS media-processing-queue
    → Media Processor Lambda:
      1. Download from temp bucket
      2. sharp: resize to [200, 600, 1200, 2400] widths
      3. Convert to WebP
      4. Generate BlurHash placeholder
      5. Strip EXIF metadata
      6. Upload variants to portfolio bucket
      7. Return variant URLs

  → SQS ai-moderation-queue
    → AI Worker: GPT-4o Vision modesty check
    → If APPROVED: Prisma UPDATE media.status = APPROVED, move to public
    → If REJECTED: delete from storage, notify user
```

---

## 10. Technology Stack Summary

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14+ App Router, React 18, TypeScript | SSR/SSG, App Router for layouts, RSC |
| Styling | Tailwind CSS, shadcn/ui | RTL-first with logical properties, accessible |
| API | tRPC v11 | End-to-end type safety, batching |
| Database | PostgreSQL (Supabase) + Prisma ORM | Managed, RLS, pgvector, realtime |
| Auth | Supabase Auth | Email/phone OTP, JWT, session management |
| Search | Meilisearch (self-hosted) | Hebrew support, typo tolerance, fast |
| Cache | Upstash Redis | Serverless-compatible, pub/sub, rate limiting |
| Real-time | Supabase Realtime + Socket.IO | Managed channels + custom WS for overflow |
| Payments | Stripe Connect | Escrow, subscriptions, marketplace fees |
| AI | OpenAI API (GPT-4o-mini, text-embedding-3-small) | Moderation, matching, summarization |
| Storage | Supabase Storage + sharp | Direct upload, image processing pipeline |
| Email | Resend / AWS SES + React Email | RTL Hebrew templates, transactional + marketing |
| Messaging | WhatsApp Cloud API | Phone verification, notifications |
| Search vectors | pgvector (Supabase) | Semantic search, AI matching |
| Monorepo | Turborepo | Build caching, task orchestration |
| CI/CD | GitHub Actions | Lint, test, deploy pipelines |
| IaC | Terraform | AWS resources provisioning |
| Monitoring | PostHog (self-hosted) | Analytics without external CDN (Netfree) |

---

## 11. Cross-Cutting Concerns

| Concern | Approach |
|---------|----------|
| **RTL** | Tailwind logical properties, `dir="rtl"` root, icon flipping |
| **Netfree** | All assets self-hosted, single-domain routing, no external CDN |
| **Content moderation** | 3-stage pipeline: sanitize → AI → human review |
| **Rate limiting** | Redis sliding window, 12 endpoint categories |
| **Caching** | Write-through + tag-based invalidation + counter buffering |
| **Privacy (IPPL)** | Consent tracking, data export/deletion, AI disclosure |
| **SEO** | Structured data (JSON-LD), SSR, meta tags, sitemaps |
| **Accessibility** | WCAG 2.1 AA, ARIA, keyboard navigation, screen reader |
| **Observability** | Structured logging, error tracking, performance metrics |

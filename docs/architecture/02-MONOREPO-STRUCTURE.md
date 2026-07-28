# 02 — Monorepo Structure

> Turborepo monorepo layout for the Kehila Community Platform

---

## 1. Overview

The project uses **Turborepo** for build orchestration with **pnpm** workspaces. The monorepo is split into three top-level directories:

| Directory | Purpose |
|-----------|---------|
| `apps/` | Deployable applications (web, WebSocket server, mobile) |
| `packages/` | Shared libraries consumed by apps and other packages |
| `workers/` | AWS Lambda / background worker functions |
| `infrastructure/` | Terraform, Docker, deployment scripts |

---

## 2. Complete Folder Structure

```
platform/
│
├── apps/
│   ├── web/                              # Next.js App Router (Vercel)
│   │   ├── app/                          # App Router pages & layouts
│   │   │   ├── (auth)/                   # Auth group (no shared layout with main)
│   │   │   │   ├── login/
│   │   │   │   │   └── page.tsx          # Email/phone login
│   │   │   │   ├── register/
│   │   │   │   │   └── page.tsx          # Multi-step registration
│   │   │   │   ├── verify/
│   │   │   │   │   └── page.tsx          # Phone/email verification
│   │   │   │   ├── forgot-password/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── layout.tsx            # Minimal auth layout (RTL, centered)
│   │   │   │
│   │   │   ├── (main)/                   # Main authenticated layout group
│   │   │   │   ├── layout.tsx            # Sidebar + header + footer layout
│   │   │   │   │
│   │   │   │   ├── page.tsx              # Homepage / feed / dashboard
│   │   │   │   │
│   │   │   │   ├── forums/
│   │   │   │   │   ├── page.tsx          # Forum category listing
│   │   │   │   │   ├── [categorySlug]/
│   │   │   │   │   │   ├── page.tsx      # Forum listing within category
│   │   │   │   │   │   └── [forumSlug]/
│   │   │   │   │   │       ├── page.tsx  # Thread listing
│   │   │   │   │   │       └── [threadSlug]/
│   │   │   │   │   │           └── page.tsx  # Thread detail + posts
│   │   │   │   │   └── new/
│   │   │   │   │       └── page.tsx      # Create new thread
│   │   │   │   │
│   │   │   │   ├── marketplace/
│   │   │   │   │   ├── page.tsx          # Marketplace landing / browse projects
│   │   │   │   │   ├── projects/
│   │   │   │   │   │   ├── page.tsx      # Project listing
│   │   │   │   │   │   ├── new/
│   │   │   │   │   │   │   └── page.tsx  # Post new project
│   │   │   │   │   │   └── [projectId]/
│   │   │   │   │   │       ├── page.tsx  # Project detail
│   │   │   │   │   │       └── proposals/
│   │   │   │   │   │           └── page.tsx  # Manage proposals
│   │   │   │   │   ├── freelancers/
│   │   │   │   │   │   ├── page.tsx      # Browse freelancers
│   │   │   │   │   │   └── [slug]/
│   │   │   │   │   │       └── page.tsx  # Freelancer profile
│   │   │   │   │   └── dashboard/
│   │   │   │   │       ├── page.tsx      # Freelancer/client dashboard
│   │   │   │   │       ├── projects/
│   │   │   │   │       │   └── page.tsx
│   │   │   │   │       └── earnings/
│   │   │   │   │           └── page.tsx
│   │   │   │   │
│   │   │   │   ├── classifieds/
│   │   │   │   │   ├── page.tsx          # Classified categories
│   │   │   │   │   ├── [categorySlug]/
│   │   │   │   │   │   ├── page.tsx      # Listings in category
│   │   │   │   │   │   └── [listingSlug]/
│   │   │   │   │   │       └── page.tsx  # Listing detail
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx      # Create listing
│   │   │   │   │   └── my-listings/
│   │   │   │   │       └── page.tsx      # User's own listings
│   │   │   │   │
│   │   │   │   ├── portfolios/
│   │   │   │   │   ├── page.tsx          # Portfolio showcase (Behance-style grid)
│   │   │   │   │   ├── [username]/
│   │   │   │   │   │   ├── page.tsx      # User's portfolio landing
│   │   │   │   │   │   └── [projectSlug]/
│   │   │   │   │   │       └── page.tsx  # Portfolio project detail
│   │   │   │   │   └── edit/
│   │   │   │   │       └── page.tsx      # Edit portfolio
│   │   │   │   │
│   │   │   │   ├── courses/
│   │   │   │   │   ├── page.tsx          # Course catalog
│   │   │   │   │   ├── [courseSlug]/
│   │   │   │   │   │   ├── page.tsx      # Course landing page
│   │   │   │   │   │   └── learn/
│   │   │   │   │   │       ├── page.tsx  # Course player (enrolled)
│   │   │   │   │   │       └── [lessonId]/
│   │   │   │   │   │           └── page.tsx
│   │   │   │   │   ├── teach/
│   │   │   │   │   │   ├── page.tsx      # Instructor dashboard
│   │   │   │   │   │   └── [courseId]/
│   │   │   │   │   │       └── edit/
│   │   │   │   │   │           └── page.tsx  # Course builder
│   │   │   │   │   └── my-courses/
│   │   │   │   │       └── page.tsx      # Enrolled courses
│   │   │   │   │
│   │   │   │   ├── articles/
│   │   │   │   │   ├── page.tsx          # Article listing / blog
│   │   │   │   │   ├── [slug]/
│   │   │   │   │   │   └── page.tsx      # Article detail
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx      # Write article
│   │   │   │   │   └── [slug]/
│   │   │   │   │       └── edit/
│   │   │   │   │           └── page.tsx  # Edit article
│   │   │   │   │
│   │   │   │   ├── directory/
│   │   │   │   │   ├── page.tsx          # Professional directory
│   │   │   │   │   └── [slug]/
│   │   │   │   │       └── page.tsx      # Professional profile
│   │   │   │   │
│   │   │   │   ├── messages/
│   │   │   │   │   ├── page.tsx          # Conversation list
│   │   │   │   │   └── [conversationId]/
│   │   │   │   │       └── page.tsx      # Conversation detail
│   │   │   │   │
│   │   │   │   ├── notifications/
│   │   │   │   │   └── page.tsx          # Notification center
│   │   │   │   │
│   │   │   │   ├── settings/
│   │   │   │   │   ├── page.tsx          # General settings
│   │   │   │   │   ├── profile/
│   │   │   │   │   │   └── page.tsx      # Profile settings
│   │   │   │   │   ├── privacy/
│   │   │   │   │   │   └── page.tsx      # Privacy, data export/delete
│   │   │   │   │   ├── notifications/
│   │   │   │   │   │   └── page.tsx      # Notification preferences
│   │   │   │   │   ├── membership/
│   │   │   │   │   │   └── page.tsx      # Subscription management
│   │   │   │   │   └── payments/
│   │   │   │   │       └── page.tsx      # Payment methods, invoices
│   │   │   │   │
│   │   │   │   ├── admin/
│   │   │   │   │   ├── page.tsx          # Admin dashboard
│   │   │   │   │   ├── users/
│   │   │   │   │   │   └── page.tsx      # User management
│   │   │   │   │   ├── moderation/
│   │   │   │   │   │   └── page.tsx      # Moderation queue
│   │   │   │   │   ├── forums/
│   │   │   │   │   │   └── page.tsx      # Forum management
│   │   │   │   │   ├── ads/
│   │   │   │   │   │   └── page.tsx      # Ad management
│   │   │   │   │   ├── reports/
│   │   │   │   │   │   └── page.tsx      # Content reports
│   │   │   │   │   └── analytics/
│   │   │   │   │       └── page.tsx      # Platform analytics
│   │   │   │   │
│   │   │   │   ├── search/
│   │   │   │   │   └── page.tsx          # Search results page
│   │   │   │   │
│   │   │   │   └── u/
│   │   │   │       └── [username]/
│   │   │   │           └── page.tsx      # Public user profile
│   │   │   │
│   │   │   ├── api/
│   │   │   │   ├── trpc/
│   │   │   │   │   └── [trpc]/
│   │   │   │   │       └── route.ts      # tRPC catch-all handler
│   │   │   │   ├── v1/
│   │   │   │   │   ├── threads/
│   │   │   │   │   │   └── route.ts      # GET public threads
│   │   │   │   │   ├── portfolios/
│   │   │   │   │   │   └── [slug]/
│   │   │   │   │   │       └── route.ts  # GET public portfolio
│   │   │   │   │   ├── professionals/
│   │   │   │   │   │   └── route.ts      # GET public directory
│   │   │   │   │   └── courses/
│   │   │   │   │       └── route.ts      # GET public courses
│   │   │   │   ├── webhooks/
│   │   │   │   │   ├── stripe/
│   │   │   │   │   │   └── route.ts      # POST Stripe webhooks
│   │   │   │   │   └── whatsapp/
│   │   │   │   │       └── route.ts      # POST WhatsApp webhooks
│   │   │   │   └── cron/
│   │   │   │       ├── digest/
│   │   │   │       │   └── route.ts      # Weekly digest email
│   │   │   │       ├── cleanup/
│   │   │   │       │   └── route.ts      # Expired listings cleanup
│   │   │   │       ├── analytics/
│   │   │   │       │   └── route.ts      # Daily analytics rollup
│   │   │   │       └── cache-warm/
│   │   │   │           └── route.ts      # Post-deploy cache warming
│   │   │   │
│   │   │   ├── layout.tsx                # Root layout
│   │   │   ├── not-found.tsx             # 404 page
│   │   │   ├── error.tsx                 # Error boundary
│   │   │   ├── loading.tsx               # Global loading
│   │   │   └── globals.css               # Global styles + Tailwind directives
│   │   │
│   │   ├── components/                   # App-specific components
│   │   │   ├── layout/
│   │   │   │   ├── header.tsx
│   │   │   │   ├── sidebar.tsx
│   │   │   │   ├── footer.tsx
│   │   │   │   ├── mobile-nav.tsx
│   │   │   │   └── breadcrumbs.tsx
│   │   │   ├── forums/
│   │   │   │   ├── thread-list.tsx
│   │   │   │   ├── thread-card.tsx
│   │   │   │   ├── post-editor.tsx       # Tiptap rich text (RTL default)
│   │   │   │   ├── post-card.tsx
│   │   │   │   └── post-reactions.tsx
│   │   │   ├── marketplace/
│   │   │   │   ├── project-card.tsx
│   │   │   │   ├── proposal-form.tsx
│   │   │   │   ├── milestone-tracker.tsx
│   │   │   │   └── escrow-status.tsx
│   │   │   ├── classifieds/
│   │   │   │   ├── listing-card.tsx
│   │   │   │   ├── listing-gallery.tsx
│   │   │   │   └── contact-reveal.tsx
│   │   │   ├── portfolios/
│   │   │   │   ├── portfolio-grid.tsx
│   │   │   │   ├── project-gallery.tsx
│   │   │   │   └── portfolio-editor.tsx
│   │   │   ├── courses/
│   │   │   │   ├── course-card.tsx
│   │   │   │   ├── lesson-player.tsx
│   │   │   │   ├── progress-bar.tsx
│   │   │   │   └── quiz-form.tsx
│   │   │   ├── articles/
│   │   │   │   ├── article-card.tsx
│   │   │   │   └── article-editor.tsx
│   │   │   ├── messages/
│   │   │   │   ├── conversation-list.tsx
│   │   │   │   ├── message-bubble.tsx
│   │   │   │   └── message-input.tsx
│   │   │   ├── search/
│   │   │   │   ├── search-bar.tsx
│   │   │   │   ├── search-results.tsx
│   │   │   │   └── search-filters.tsx
│   │   │   ├── shared/
│   │   │   │   ├── user-avatar.tsx
│   │   │   │   ├── tag-badge.tsx
│   │   │   │   ├── pagination.tsx
│   │   │   │   ├── image-upload.tsx
│   │   │   │   ├── rich-text-renderer.tsx
│   │   │   │   └── seo-head.tsx
│   │   │   └── providers/
│   │   │       ├── trpc-provider.tsx
│   │   │       ├── auth-provider.tsx
│   │   │       ├── theme-provider.tsx
│   │   │       └── realtime-provider.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── use-auth.ts
│   │   │   ├── use-realtime.ts
│   │   │   ├── use-search.ts
│   │   │   ├── use-infinite-scroll.ts
│   │   │   ├── use-upload.ts
│   │   │   └── use-membership.ts
│   │   │
│   │   ├── lib/
│   │   │   ├── trpc.ts                   # tRPC client setup
│   │   │   ├── supabase-browser.ts       # Supabase client (browser)
│   │   │   ├── supabase-server.ts        # Supabase client (server)
│   │   │   ├── utils.ts                  # cn(), formatDate(), etc.
│   │   │   └── constants.ts              # Routes, config
│   │   │
│   │   ├── public/
│   │   │   ├── fonts/                    # Self-hosted Hebrew fonts
│   │   │   │   ├── heebo/
│   │   │   │   ├── rubik/
│   │   │   │   └── noto-sans-hebrew/
│   │   │   ├── icons/                    # PWA icons
│   │   │   ├── og/                       # Default OG images
│   │   │   └── manifest.json             # PWA manifest
│   │   │
│   │   ├── middleware.ts                  # Auth redirect, locale, rate limit headers
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── ws-server/                        # Standalone WebSocket server
│   │   ├── src/
│   │   │   ├── index.ts                  # Server entry point
│   │   │   ├── channels/
│   │   │   │   ├── typing.ts             # Typing indicator channel
│   │   │   │   ├── marketplace-chat.ts   # Live marketplace transaction chat
│   │   │   │   └── presence.ts           # Online presence tracking
│   │   │   ├── auth/
│   │   │   │   └── jwt-validator.ts      # Validate Supabase JWT on WS connect
│   │   │   ├── adapters/
│   │   │   │   └── redis-adapter.ts      # Socket.IO Redis adapter
│   │   │   └── middleware/
│   │   │       ├── rate-limit.ts
│   │   │       └── auth.ts
│   │   ├── Dockerfile
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── mobile/                           # React Native / Capacitor (future)
│       ├── src/
│       ├── android/
│       ├── ios/
│       └── package.json
│
├── packages/
│   ├── api/                              # tRPC routers & server logic
│   │   ├── src/
│   │   │   ├── trpc.ts                   # Context, procedures, middleware
│   │   │   ├── root.ts                   # Root router combining all sub-routers
│   │   │   └── routers/
│   │   │       ├── user.ts               # Profile CRUD, settings, data export
│   │   │       ├── forum.ts              # Category/forum listing, access control
│   │   │       ├── thread.ts             # Thread CRUD, pin, lock, subscribe
│   │   │       ├── post.ts               # Post CRUD, reactions, accept answer
│   │   │       ├── marketplace.ts        # Freelancer profile, projects, proposals
│   │   │       ├── classified.ts         # Listing CRUD, favorites, contact
│   │   │       ├── portfolio.ts          # Portfolio/project/media CRUD, likes
│   │   │       ├── course.ts             # Course CRUD, enrollment, progress
│   │   │       ├── article.ts            # Article CRUD, comments, editor picks
│   │   │       ├── message.ts            # Conversations, send message, mark read
│   │   │       ├── notification.ts       # List, mark read, preferences
│   │   │       ├── search.ts             # Unified + federated search
│   │   │       ├── ad.ts                 # Ad CRUD, impression/click tracking
│   │   │       ├── moderation.ts         # Queue, approve/reject, reports
│   │   │       ├── admin.ts              # Dashboard stats, user mgmt, config
│   │   │       └── media.ts              # Signed upload URLs, confirmations
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── db/                               # Prisma schema & client
│   │   ├── prisma/
│   │   │   ├── schema.prisma             # Complete schema (40+ models)
│   │   │   ├── migrations/               # Prisma migrations
│   │   │   └── seed.ts                   # Seed data
│   │   ├── src/
│   │   │   └── client.ts                 # Prisma client singleton
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── ui/                               # Shared UI component library
│   │   ├── src/
│   │   │   └── components/
│   │   │       ├── button.tsx
│   │   │       ├── input.tsx
│   │   │       ├── textarea.tsx
│   │   │       ├── select.tsx
│   │   │       ├── dialog.tsx
│   │   │       ├── dropdown-menu.tsx
│   │   │       ├── tabs.tsx
│   │   │       ├── card.tsx
│   │   │       ├── badge.tsx
│   │   │       ├── avatar.tsx
│   │   │       ├── tooltip.tsx
│   │   │       ├── skeleton.tsx
│   │   │       ├── toast.tsx
│   │   │       ├── form.tsx
│   │   │       ├── table.tsx
│   │   │       ├── pagination.tsx
│   │   │       ├── sheet.tsx             # Mobile slide-over (RTL)
│   │   │       ├── command.tsx           # Command palette
│   │   │       └── rich-text-editor.tsx  # Tiptap wrapper (RTL default)
│   │   ├── tailwind.config.ts            # Shared Tailwind config with RTL
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── ai/                               # AI services
│   │   ├── src/
│   │   │   ├── moderation/
│   │   │   │   ├── text-moderator.ts     # OpenAI Moderation + GPT-4o-mini
│   │   │   │   └── image-moderator.ts    # GPT-4o Vision modesty check
│   │   │   ├── embeddings/
│   │   │   │   └── embedding-service.ts  # text-embedding-3-small wrapper
│   │   │   ├── matching/
│   │   │   │   └── job-matcher.ts        # Freelancer-project matching
│   │   │   ├── summarization/
│   │   │   │   └── thread-summarizer.ts  # Long thread summarization
│   │   │   └── recommendations/
│   │   │       └── feed-recommender.ts   # Content recommendations
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── payments/                         # Stripe Connect integration
│   │   ├── src/
│   │   │   ├── stripe.ts                 # Stripe client singleton
│   │   │   ├── escrow.ts                 # Marketplace escrow logic
│   │   │   ├── subscriptions.ts          # Membership tier management
│   │   │   ├── course-payments.ts        # Course purchase logic
│   │   │   └── webhooks.ts              # Stripe webhook handler
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── email/                            # Email templates & sender
│   │   ├── src/
│   │   │   ├── sender.ts                 # Resend/SES email sending
│   │   │   └── templates/
│   │   │       ├── welcome.tsx           # Welcome email
│   │   │       ├── verify-email.tsx      # Email verification
│   │   │       ├── password-reset.tsx    # Password reset
│   │   │       ├── new-message.tsx       # New direct message
│   │   │       ├── thread-reply.tsx      # Forum reply notification
│   │   │       ├── proposal-received.tsx # Marketplace proposal
│   │   │       ├── milestone-funded.tsx  # Payment milestone funded
│   │   │       ├── milestone-released.tsx# Payment released
│   │   │       ├── course-enrolled.tsx   # Course enrollment confirm
│   │   │       ├── weekly-digest.tsx     # Weekly digest
│   │   │       ├── listing-expiring.tsx  # Classified expiry warning
│   │   │       └── moderation-action.tsx # Content moderation result
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── whatsapp/                         # WhatsApp Business API
│   │   ├── src/
│   │   │   ├── client.ts                 # WhatsApp Cloud API client
│   │   │   ├── templates.ts              # Message template definitions
│   │   │   └── webhooks.ts              # WhatsApp webhook handler
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── search/                           # Meilisearch integration
│   │   ├── src/
│   │   │   ├── client.ts                 # Meilisearch client
│   │   │   ├── indexes.ts               # Index configs (7 indexes)
│   │   │   └── indexer.ts               # Content indexing logic
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── cache/                            # Redis caching layer
│   │   ├── src/
│   │   │   ├── redis.ts                  # Upstash Redis client
│   │   │   ├── cache.ts                  # Cache patterns (get/set/invalidate)
│   │   │   └── rate-limiter.ts           # Sliding window rate limiter
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── config/                           # Shared configurations
│       ├── eslint/
│       │   └── index.js                  # Shared ESLint config
│       ├── typescript/
│       │   └── base.json                 # Shared tsconfig
│       └── tailwind/
│           └── base.ts                   # Shared Tailwind preset
│
├── workers/                              # AWS Lambda workers
│   ├── ai-worker/
│   │   ├── src/
│   │   │   ├── handler.ts               # SQS event handler
│   │   │   ├── moderate-text.ts          # Text moderation pipeline
│   │   │   ├── moderate-image.ts         # Image modesty pipeline
│   │   │   ├── generate-embedding.ts     # Embedding generation
│   │   │   ├── match-jobs.ts             # Job matching
│   │   │   └── summarize-thread.ts       # Thread summarization
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── search-indexer/
│   │   ├── src/
│   │   │   ├── handler.ts               # SQS event handler
│   │   │   ├── sync-thread.ts           # Thread → Meilisearch
│   │   │   ├── sync-article.ts          # Article → Meilisearch
│   │   │   ├── sync-freelancer.ts       # Freelancer → Meilisearch
│   │   │   ├── sync-classified.ts       # Classified → Meilisearch
│   │   │   ├── sync-portfolio.ts        # Portfolio → Meilisearch
│   │   │   ├── sync-course.ts           # Course → Meilisearch
│   │   │   ├── sync-user.ts             # User → Meilisearch
│   │   │   └── bulk-reindex.ts          # Full reindex script
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── notification-worker/
│   │   ├── src/
│   │   │   ├── handler.ts               # SQS event handler
│   │   │   ├── send-email.ts            # Email via Resend/SES
│   │   │   ├── send-whatsapp.ts         # WhatsApp via Cloud API
│   │   │   └── send-push.ts             # Web push notifications
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── media-processor/
│       ├── src/
│       │   ├── handler.ts               # SQS event handler
│       │   ├── resize.ts                # Image resizing (sharp)
│       │   ├── convert-webp.ts          # WebP conversion
│       │   ├── blurhash.ts              # BlurHash generation
│       │   ├── strip-exif.ts            # EXIF metadata removal
│       │   └── watermark.ts             # Optional watermarking
│       ├── tsconfig.json
│       └── package.json
│
├── infrastructure/
│   ├── terraform/
│   │   ├── main.tf                       # Provider config, state backend
│   │   ├── ecs.tf                        # ECS Fargate (WS server)
│   │   ├── lambda.tf                     # Lambda functions ×4
│   │   ├── sqs.tf                        # SQS queues ×5 + DLQs
│   │   ├── sns.tf                        # SNS topics ×3
│   │   ├── ec2-meilisearch.tf            # Meilisearch cluster (3× EC2)
│   │   ├── alb.tf                        # Internal ALB for Meilisearch
│   │   ├── eventbridge.tf                # Scheduled rules
│   │   ├── iam.tf                        # IAM roles and policies
│   │   ├── vpc.tf                        # VPC, subnets, security groups
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── environments/
│   │       ├── staging.tfvars
│   │       └── production.tfvars
│   │
│   ├── docker/
│   │   ├── ws-server.Dockerfile          # WebSocket server
│   │   ├── ai-worker.Dockerfile          # AI worker Lambda
│   │   ├── search-indexer.Dockerfile      # Search indexer Lambda
│   │   ├── notification-worker.Dockerfile # Notification worker Lambda
│   │   └── media-processor.Dockerfile     # Media processor Lambda
│   │
│   └── scripts/
│       ├── deploy.sh                     # Deployment orchestration
│       ├── migrate.sh                    # Database migration runner
│       ├── seed.sh                       # Database seeder
│       ├── reindex.sh                    # Meilisearch full reindex
│       └── backup.sh                     # Database backup
│
├── .github/
│   └── workflows/
│       ├── ci.yml                        # Lint, typecheck, test, build
│       ├── deploy-preview.yml            # Preview deployments
│       └── deploy-production.yml         # Production deployment
│
├── turbo.json                            # Turborepo pipeline config
├── package.json                          # Root package.json (pnpm workspace)
├── pnpm-workspace.yaml                   # Workspace definitions
├── .env.example                          # Environment variable template
├── docker-compose.yml                    # Local development environment
├── .eslintrc.js                          # Root ESLint config
├── .prettierrc                           # Prettier config
└── README.md
```

---

## 3. Turborepo Pipeline Configuration

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"],
      "env": [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "NEXT_PUBLIC_WS_URL",
        "NEXT_PUBLIC_MEILISEARCH_URL"
      ]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:e2e": {
      "dependsOn": ["build"],
      "outputs": ["test-results/**"]
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    },
    "db:seed": {
      "cache": false
    }
  }
}
```

---

## 4. Package Dependency Graph

```
apps/web
  ├── packages/api          (tRPC routers)
  ├── packages/db           (Prisma client)
  ├── packages/ui           (shared components)
  ├── packages/cache        (Redis client)
  ├── packages/search       (Meilisearch client)
  └── packages/config       (shared configs)

apps/ws-server
  ├── packages/db           (Prisma client)
  ├── packages/cache        (Redis client)
  └── packages/config       (shared configs)

packages/api
  ├── packages/db           (Prisma client)
  ├── packages/ai           (AI services)
  ├── packages/payments     (Stripe logic)
  ├── packages/cache        (Redis client)
  ├── packages/search       (Meilisearch client)
  └── packages/email        (email sending)

workers/ai-worker
  ├── packages/db           (Prisma client)
  ├── packages/ai           (AI services)
  └── packages/cache        (Redis client)

workers/search-indexer
  ├── packages/db           (Prisma client)
  └── packages/search       (Meilisearch client)

workers/notification-worker
  ├── packages/db           (Prisma client)
  ├── packages/email        (email templates + sending)
  ├── packages/whatsapp     (WhatsApp client)
  └── packages/cache        (Redis rate limiting)

workers/media-processor
  ├── packages/db           (Prisma client)
  └── packages/cache        (Redis client)
```

---

## 5. pnpm Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
  - "workers/*"
```

---

## 6. Docker Compose (Local Development)

```yaml
# docker-compose.yml
version: "3.9"

services:
  postgres:
    image: supabase/postgres:15.1.1.41
    ports:
      - "5432:5432"
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: platform_dev
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  meilisearch:
    image: getmeili/meilisearch:v1.6
    ports:
      - "7700:7700"
    environment:
      MEILI_MASTER_KEY: dev_master_key
      MEILI_ENV: development
    volumes:
      - msdata:/meili_data

  supabase-studio:
    image: supabase/studio:latest
    ports:
      - "3001:3000"
    environment:
      SUPABASE_URL: http://localhost:8000
      STUDIO_PG_META_URL: http://localhost:5432

volumes:
  pgdata:
  msdata:
```

---

## 7. Environment Variables Template

```bash
# .env.example

# ── Supabase ──
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/platform_dev
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/platform_dev

# ── Redis ──
UPSTASH_REDIS_REST_URL=http://localhost:6379
UPSTASH_REDIS_REST_TOKEN=dev-token

# ── Meilisearch ──
NEXT_PUBLIC_MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_MASTER_KEY=dev_master_key

# ── Stripe ──
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_CONNECT_CLIENT_ID=ca_...

# ── OpenAI ──
OPENAI_API_KEY=sk-...

# ── WhatsApp ──
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=...

# ── Email ──
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@platform.co.il

# ── WebSocket ──
NEXT_PUBLIC_WS_URL=ws://localhost:3002

# ── AWS (workers) ──
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
SQS_AI_MODERATION_QUEUE_URL=...
SQS_SEARCH_SYNC_QUEUE_URL=...
SQS_NOTIFICATION_QUEUE_URL=...
SQS_MEDIA_PROCESSING_QUEUE_URL=...
SQS_EMAIL_SEND_QUEUE_URL=...
SNS_CONTENT_EVENTS_TOPIC_ARN=...
SNS_USER_EVENTS_TOPIC_ARN=...
SNS_PAYMENT_EVENTS_TOPIC_ARN=...

# ── App ──
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

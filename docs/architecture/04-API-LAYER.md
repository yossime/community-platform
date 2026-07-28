# 04 — API Layer

## 1. Overview

The platform exposes two API surfaces:

| Surface | Transport | Consumers | Auth |
|---------|-----------|-----------|------|
| **tRPC** | HTTP + WebSocket | Web app, React Native mobile app | Supabase JWT |
| **REST `/api/v1/`** | HTTP | SEO crawlers, third-party integrations, webhooks | API key / signature |

**Design principles:**

- **tRPC** is the primary API for all first-party clients. It provides end-to-end type safety from the database layer through to the UI, eliminating an entire class of runtime bugs. Every query and mutation is fully typed, and the client SDK is auto-generated from the router definitions.
- **REST** endpoints are reserved for public consumers that cannot use tRPC (search-engine crawlers that need stable URLs, third-party apps, and inbound webhooks from Stripe/WhatsApp).
- **All mutations that create or modify user-generated content** pass through a moderation middleware that publishes the content to an SNS topic for asynchronous review (automated + human).
- **Rate limiting** is enforced at the middleware level using a Redis sliding-window algorithm, with different limits per endpoint category.
- **Input validation** is handled by Zod schemas co-located with each procedure. Invalid input is rejected before any business logic executes.

---

## 2. tRPC Architecture

### 2.1 Context & Middleware Chain

Every tRPC request begins by constructing a **context object** that carries shared dependencies. The context is created once per request and threaded through all middleware and procedures.

```typescript
// packages/api/src/trpc.ts

import { initTRPC, TRPCError } from "@trpc/server";
import { type CreateNextContextOptions } from "@trpc/server/adapters/next";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@kp/db";
import { redis } from "@kp/redis";
import { meilisearch } from "@kp/search";
import { type User, type MembershipTier } from "@kp/db";
import superjson from "superjson";
import { ZodError } from "zod";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface Context {
  /** Authenticated user, or null for anonymous requests */
  user: (User & { membership: Membership }) | null;
  /** Supabase client scoped to the request (RLS-aware) */
  supabase: ReturnType<typeof createClient>;
  /** Prisma ORM client */
  prisma: typeof prisma;
  /** Redis client for caching and rate-limiting */
  redis: typeof redis;
  /** Meilisearch client for full-text / semantic search */
  meilisearch: typeof meilisearch;
  /** Raw request headers (used for IP extraction) */
  headers: Headers;
  /** Client IP address (for anonymous rate-limiting) */
  ip: string;
}

export const createTRPCContext = async (
  opts: CreateNextContextOptions,
): Promise<Context> => {
  const { req } = opts;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: req.headers.authorization ?? "" },
      },
    },
  );

  // Attempt to resolve the authenticated user from the JWT.
  let user: Context["user"] = null;
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (token) {
    const {
      data: { user: supabaseUser },
    } = await supabase.auth.getUser(token);

    if (supabaseUser) {
      user = await prisma.user.findUnique({
        where: { supabaseAuthId: supabaseUser.id },
        include: { membership: true },
      });
    }
  }

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";

  return {
    user,
    supabase,
    prisma,
    redis,
    meilisearch,
    headers: new Headers(req.headers as Record<string, string>),
    ip,
  };
};

// ---------------------------------------------------------------------------
// tRPC initialisation
// ---------------------------------------------------------------------------

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
```

#### Middleware Chain

Middleware is applied **in order**. Each layer can short-circuit the request or enrich the context before passing control to the next layer.

```typescript
// packages/api/src/middleware/auth.ts

import { TRPCError } from "@trpc/server";
import { t } from "../trpc";

/**
 * 1. authMiddleware
 *    Validates the Supabase JWT and attaches the user to the context.
 *    Rejects with UNAUTHORIZED if no valid session exists.
 */
export const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required. Please sign in.",
    });
  }

  if (ctx.user.status === "SUSPENDED") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your account has been suspended. Contact support.",
    });
  }

  if (ctx.user.status === "BANNED") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your account has been permanently banned.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // now guaranteed non-null
    },
  });
});
```

```typescript
// packages/api/src/middleware/rateLimit.ts

import { TRPCError } from "@trpc/server";
import { t } from "../trpc";

interface RateLimitOptions {
  /** Maximum requests in the window */
  max: number;
  /** Window size in seconds */
  windowSec: number;
  /** Key prefix (e.g. "mutation", "search") */
  prefix: string;
}

/**
 * 2. rateLimitMiddleware
 *    Enforces a Redis sliding-window rate limit keyed by userId (authenticated)
 *    or IP address (anonymous).
 */
export const rateLimitMiddleware = (opts: RateLimitOptions) =>
  t.middleware(async ({ ctx, next }) => {
    const key = `rl:${opts.prefix}:${ctx.user?.id ?? ctx.ip}`;
    const now = Date.now();
    const windowMs = opts.windowSec * 1000;

    // Remove entries outside the window
    await ctx.redis.zremrangebyscore(key, 0, now - windowMs);

    // Count remaining entries
    const count = await ctx.redis.zcard(key);

    if (count >= opts.max) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Max ${opts.max} requests per ${opts.windowSec}s.`,
      });
    }

    // Add current request
    await ctx.redis.zadd(key, now, `${now}:${Math.random()}`);
    await ctx.redis.expire(key, opts.windowSec);

    return next();
  });
```

```typescript
// packages/api/src/middleware/membership.ts

import { TRPCError } from "@trpc/server";
import { t } from "../trpc";
import { type MembershipTierName } from "@kp/db";

const TIER_HIERARCHY: Record<MembershipTierName, number> = {
  FREE: 0,
  PROFESSIONAL: 1,
  BUSINESS: 2,
  ENTERPRISE: 3,
};

/**
 * 3. membershipMiddleware
 *    Checks that the authenticated user has at least the required membership
 *    tier. Rejects with a structured MEMBERSHIP_REQUIRED error otherwise.
 */
export const membershipMiddleware = (requiredTier: MembershipTierName) =>
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    }

    const userLevel = TIER_HIERARCHY[ctx.user.membership.tier] ?? 0;
    const requiredLevel = TIER_HIERARCHY[requiredTier] ?? 0;

    if (userLevel < requiredLevel) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `This feature requires a ${requiredTier} membership or above.`,
        cause: {
          type: "MEMBERSHIP_REQUIRED",
          requiredTier,
          currentTier: ctx.user.membership.tier,
        },
      });
    }

    return next();
  });
```

```typescript
// packages/api/src/middleware/moderation.ts

import { TRPCError } from "@trpc/server";
import { t } from "../trpc";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const sns = new SNSClient({ region: process.env.AWS_REGION });
const MODERATION_TOPIC_ARN = process.env.SNS_MODERATION_TOPIC_ARN!;

/**
 * 4. moderationMiddleware
 *    Intercepts mutations that create or modify user-generated content.
 *    Publishes the content to an SNS topic for asynchronous moderation
 *    (OpenAI Moderation API + human review queue).
 *
 *    If the user has a "trusted" reputation flag, the content is
 *    auto-approved and the SNS message is informational only.
 */
export const moderationMiddleware = t.middleware(
  async ({ ctx, next, rawInput, path }) => {
    const result = await next();

    // After the mutation succeeds, publish to moderation queue
    if (ctx.user) {
      const isTrusted =
        ctx.user.reputationScore >= 500 && ctx.user.trustLevel >= 3;

      await sns.send(
        new PublishCommand({
          TopicArn: MODERATION_TOPIC_ARN,
          Message: JSON.stringify({
            userId: ctx.user.id,
            procedure: path,
            input: rawInput,
            isTrusted,
            timestamp: new Date().toISOString(),
          }),
          MessageAttributes: {
            eventType: {
              DataType: "String",
              StringValue: "content.moderation",
            },
            priority: {
              DataType: "String",
              StringValue: isTrusted ? "low" : "high",
            },
          },
        }),
      );
    }

    return result;
  },
);
```

#### Composing Procedures from Middleware

```typescript
// packages/api/src/trpc.ts  (continued)

/** Public procedure — no auth required, basic rate-limiting only */
export const publicProcedure = t.procedure.use(
  rateLimitMiddleware({ max: 100, windowSec: 60, prefix: "public" }),
);

/** Protected procedure — auth required */
export const protectedProcedure = t.procedure
  .use(authMiddleware)
  .use(rateLimitMiddleware({ max: 30, windowSec: 60, prefix: "mutation" }));

/** Moderated procedure — auth + content moderation */
export const moderatedProcedure = t.procedure
  .use(authMiddleware)
  .use(rateLimitMiddleware({ max: 30, windowSec: 60, prefix: "mutation" }))
  .use(moderationMiddleware);

/** Moderator-only procedure */
export const moderatorProcedure = t.procedure
  .use(authMiddleware)
  .use(
    t.middleware(async ({ ctx, next }) => {
      if (
        !ctx.user ||
        !["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(ctx.user.role)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Moderator access required.",
        });
      }
      return next();
    }),
  );

/** Admin-only procedure */
export const adminProcedure = t.procedure
  .use(authMiddleware)
  .use(rateLimitMiddleware({ max: 60, windowSec: 60, prefix: "admin" }))
  .use(
    t.middleware(async ({ ctx, next }) => {
      if (
        !ctx.user ||
        !["ADMIN", "SUPER_ADMIN"].includes(ctx.user.role)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required.",
        });
      }
      return next();
    }),
  );

/** Super-admin-only procedure */
export const superAdminProcedure = t.procedure
  .use(authMiddleware)
  .use(rateLimitMiddleware({ max: 60, windowSec: 60, prefix: "admin" }))
  .use(
    t.middleware(async ({ ctx, next }) => {
      if (!ctx.user || ctx.user.role !== "SUPER_ADMIN") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Super-admin access required.",
        });
      }
      return next();
    }),
  );

/** Membership-gated procedure factory */
export const membershipProcedure = (tier: MembershipTierName) =>
  t.procedure
    .use(authMiddleware)
    .use(rateLimitMiddleware({ max: 30, windowSec: 60, prefix: "mutation" }))
    .use(membershipMiddleware(tier));
```

---

### 2.2 Root Router

All sub-routers are combined into a single root router. The type of this router is exported and consumed by the client SDK to provide end-to-end type safety.

```typescript
// packages/api/src/root.ts

import { router } from "./trpc";
import { userRouter } from "./routers/user";
import { forumRouter } from "./routers/forum";
import { threadRouter } from "./routers/thread";
import { postRouter } from "./routers/post";
import { marketplaceRouter } from "./routers/marketplace";
import { classifiedRouter } from "./routers/classified";
import { portfolioRouter } from "./routers/portfolio";
import { courseRouter } from "./routers/course";
import { articleRouter } from "./routers/article";
import { messageRouter } from "./routers/message";
import { notificationRouter } from "./routers/notification";
import { searchRouter } from "./routers/search";
import { adRouter } from "./routers/ad";
import { moderationRouter } from "./routers/moderation";
import { adminRouter } from "./routers/admin";
import { mediaRouter } from "./routers/media";

export const appRouter = router({
  user: userRouter,
  forum: forumRouter,
  thread: threadRouter,
  post: postRouter,
  marketplace: marketplaceRouter,
  classified: classifiedRouter,
  portfolio: portfolioRouter,
  course: courseRouter,
  article: articleRouter,
  message: messageRouter,
  notification: notificationRouter,
  search: searchRouter,
  ad: adRouter,
  moderation: moderationRouter,
  admin: adminRouter,
  media: mediaRouter,
});

/** Type signature of the root router — used by the client SDK */
export type AppRouter = typeof appRouter;
```

---

### 2.3 All tRPC Routers (Detailed)

Below is the complete specification for every procedure exposed by the API. Each table includes the procedure name, type (query or mutation), authentication/authorization level, input schema, and a description of what it does.

---

#### `userRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `user.getProfile` | query | public | `{ userId?: string; username?: string }` | Fetch a user's public profile by ID or username. Returns display name, avatar, bio, profession, reputation, and portfolio summary. |
| `user.updateProfile` | mutation | protected | `{ displayName?: string; bio?: string; profession?: string; avatar?: string; location?: string; languages?: string[]; socialLinks?: Record<string, string> }` | Update the authenticated user's own profile. Each field is optional; only provided fields are updated. |
| `user.getSettings` | query | protected | `void` | Retrieve the authenticated user's settings (notification preferences, privacy settings, language, gender-filter preference). |
| `user.updateSettings` | mutation | protected | `{ emailNotifications?: boolean; pushNotifications?: boolean; whatsappNotifications?: boolean; profileVisibility?: "PUBLIC" \| "MEMBERS_ONLY" \| "PRIVATE"; language?: "he" \| "en" \| "yi"; genderFilter?: "ALL" \| "MALE" \| "FEMALE" }` | Update the authenticated user's settings. |
| `user.getReputation` | query | public | `{ userId: string }` | Get a user's reputation breakdown: total score, badges earned, contribution counts by type. |
| `user.exportData` | mutation | protected | `void` | Request a full data export (IPPL compliance). Queues an async job that generates a JSON archive and emails a download link. Returns `{ jobId: string }`. |
| `user.deleteAccount` | mutation | protected | `{ confirmation: string }` | Permanently delete the authenticated user's account and all associated data (IPPL compliance). Requires the user to type their username as confirmation. Soft-deletes immediately, hard-deletes after 30-day grace period. |
| `user.follow` | mutation | protected | `{ targetUserId: string }` | Follow another user. Creates a notification for the target user. |
| `user.unfollow` | mutation | protected | `{ targetUserId: string }` | Unfollow a previously followed user. |

---

#### `forumRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `forum.listCategories` | query | public | `void` | List all forum categories with their forums. Categories are ordered by `sortOrder`. |
| `forum.listForums` | query | public | `{ categoryId?: string; genderFilter?: "ALL" \| "MALE" \| "FEMALE" }` | List forums, optionally filtered by category. Respects gender-specific forums based on the user's profile or the `genderFilter` param. Membership-gated forums show a lock icon for non-qualifying users. |
| `forum.getBySlug` | query | public | `{ slug: string }` | Get a single forum by its URL slug, including description, rules, moderator list, and thread count. |

---

#### `threadRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `thread.list` | query | public | `{ forumId: string; cursor?: string; limit?: number; sort?: "latest" \| "popular" \| "unanswered"; tag?: string }` | Paginated thread listing for a specific forum. Supports cursor-based pagination. Pinned threads always appear first. |
| `thread.getBySlug` | query | public | `{ slug: string; postCursor?: string; postLimit?: number }` | Fetch a single thread by slug with its first page of posts. Increments the view counter. Returns thread metadata, author info, and paginated posts. |
| `thread.create` | mutation | protected + moderation | `{ forumId: string; title: string; content: string; format: "DISCUSSION" \| "QA" \| "ARTICLE"; tags?: string[]; poll?: { question: string; options: string[]; expiresAt?: Date } }` | Create a new thread. Content passes through the moderation middleware. Supports three formats: free-form discussion, Q&A (with accepted answers), and long-form article. Optionally attach a poll. |
| `thread.update` | mutation | protected (owner only) | `{ threadId: string; title?: string; content?: string; tags?: string[] }` | Update an existing thread. Only the thread author can edit. Edited threads show an "edited" indicator with timestamp. |
| `thread.delete` | mutation | protected (owner or moderator) | `{ threadId: string; reason?: string }` | Soft-delete a thread. Owners can delete their own threads; moderators can delete any thread (with a required reason). |
| `thread.pin` | mutation | moderator | `{ threadId: string; pinned: boolean }` | Pin or unpin a thread within its forum. Pinned threads appear at the top of the listing. |
| `thread.lock` | mutation | moderator | `{ threadId: string; locked: boolean; reason?: string }` | Lock or unlock a thread. Locked threads cannot receive new posts. |
| `thread.subscribe` | mutation | protected | `{ threadId: string }` | Subscribe to a thread to receive notifications on new posts. |
| `thread.unsubscribe` | mutation | protected | `{ threadId: string }` | Unsubscribe from thread notifications. |
| `thread.getSummary` | query | protected (PROFESSIONAL+) | `{ threadId: string }` | Generate or retrieve an AI-powered summary of a long thread. Uses GPT-4o to summarise key points and the consensus. Cached for 1 hour. Requires PROFESSIONAL membership or above. |

---

#### `postRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `post.list` | query | public | `{ threadId: string; cursor?: string; limit?: number; sort?: "oldest" \| "newest" \| "votes" }` | Paginated post listing within a thread. Default sort is `oldest` (chronological). |
| `post.create` | mutation | protected + moderation | `{ threadId: string; content: string; replyToId?: string }` | Create a new post in a thread. Supports nested replies via `replyToId`. Content is moderated. Triggers notifications to thread subscribers. |
| `post.update` | mutation | protected (owner only) | `{ postId: string; content: string }` | Edit an existing post. Only the post author can edit. Stores edit history. |
| `post.delete` | mutation | protected (owner or moderator) | `{ postId: string; reason?: string }` | Soft-delete a post. Content is replaced with "[deleted]" but the post shell remains to preserve thread structure. |
| `post.react` | mutation | protected | `{ postId: string; reaction: "LIKE" \| "HELPFUL" \| "INSIGHTFUL" \| "FUNNY" }` | Add or remove a reaction on a post. Toggling the same reaction removes it. Updates the author's reputation score. |
| `post.acceptAnswer` | mutation | protected (thread owner, QA threads only) | `{ postId: string }` | Mark a post as the accepted answer in a QA-format thread. Only the thread creator can accept an answer. Awards bonus reputation to the answer author. |

---

#### `marketplaceRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `marketplace.getFreelancerProfile` | query | public | `{ userId: string }` | Get a freelancer's marketplace profile including skills, hourly rate, availability, rating, and completed project count. |
| `marketplace.updateFreelancerProfile` | mutation | protected | `{ headline?: string; skills?: string[]; hourlyRate?: number; currency?: "ILS" \| "USD" \| "EUR"; availability?: "AVAILABLE" \| "BUSY" \| "UNAVAILABLE"; bio?: string }` | Update the authenticated user's freelancer profile. |
| `marketplace.connectStripe` | mutation | protected | `{ returnUrl: string }` | Initiate Stripe Connect onboarding for the freelancer. Returns a `{ url: string }` with the Stripe-hosted onboarding URL. |
| `marketplace.listProjects` | query | public | `{ cursor?: string; limit?: number; category?: string; budget?: { min?: number; max?: number }; skills?: string[]; status?: "OPEN" \| "IN_PROGRESS" \| "COMPLETED" }` | Browse marketplace projects with filters. Supports cursor pagination. |
| `marketplace.getProject` | query | public | `{ projectId: string }` | Get full project details including description, budget, required skills, timeline, and client info. |
| `marketplace.createProject` | mutation | protected + moderation | `{ title: string; description: string; category: string; budget: { min: number; max: number; currency: "ILS" \| "USD" \| "EUR" }; skills: string[]; deadline?: Date }` | Post a new project to the marketplace. Content is moderated before becoming publicly visible. |
| `marketplace.updateProject` | mutation | protected (owner only) | `{ projectId: string; title?: string; description?: string; budget?: { min: number; max: number }; status?: "OPEN" \| "IN_PROGRESS" \| "COMPLETED" \| "CANCELLED" }` | Update a project listing. Only the project owner can update. |
| `marketplace.listProposals` | query | protected | `{ projectId: string }` | List proposals for a project. Project owners see all proposals; freelancers see only their own. |
| `marketplace.createProposal` | mutation | protected (PROFESSIONAL+) | `{ projectId: string; coverLetter: string; proposedBudget: number; estimatedDays: number; milestones?: { title: string; amount: number; description: string }[] }` | Submit a proposal for a project. Requires PROFESSIONAL membership or above. |
| `marketplace.updateProposalStatus` | mutation | protected (project owner) | `{ proposalId: string; status: "ACCEPTED" \| "REJECTED" \| "SHORTLISTED" }` | Accept, reject, or shortlist a proposal. Accepting a proposal changes the project status to IN_PROGRESS. |
| `marketplace.createMilestone` | mutation | protected | `{ projectId: string; title: string; description: string; amount: number; dueDate?: Date }` | Create a new milestone within an active project. Both client and freelancer can propose milestones. |
| `marketplace.fundMilestone` | mutation | protected | `{ milestoneId: string; paymentMethodId: string }` | Fund a milestone via Stripe. Creates a PaymentIntent and puts funds in escrow. Only the project client can fund milestones. |
| `marketplace.releaseMilestone` | mutation | protected (client only) | `{ milestoneId: string }` | Release escrowed funds to the freelancer upon milestone completion. Triggers a Stripe Transfer to the freelancer's connected account. |
| `marketplace.disputeMilestone` | mutation | protected | `{ milestoneId: string; reason: string; evidence?: string[] }` | Open a dispute on a milestone. Either party can dispute. Creates a moderation case for admin review. |
| `marketplace.createReview` | mutation | protected (project participant) | `{ projectId: string; rating: number; comment: string }` | Leave a review after project completion. Both client and freelancer can review each other. Rating is 1-5. |
| `marketplace.getAiMatches` | query | protected (PROFESSIONAL+) | `{ projectId: string; limit?: number }` | Get AI-powered freelancer-project matches. Uses embeddings similarity on skills, experience, and past project history. Requires PROFESSIONAL membership. |

---

#### `classifiedRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `classified.listCategories` | query | public | `void` | List all classified ad categories (e.g. "Office Space", "Equipment", "Services", "Jobs"). |
| `classified.list` | query | public | `{ categoryId?: string; cursor?: string; limit?: number; location?: string; priceRange?: { min?: number; max?: number }; sort?: "newest" \| "price_asc" \| "price_desc" }` | Paginated classified ad listing with filters. |
| `classified.getBySlug` | query | public | `{ slug: string }` | Get a single classified ad by slug with full details, images, seller info, and similar listings. |
| `classified.create` | mutation | protected + moderation | `{ categoryId: string; title: string; description: string; price?: number; currency?: "ILS" \| "USD"; location?: string; images?: string[]; contactMethod: "PHONE" \| "EMAIL" \| "WHATSAPP" \| "IN_APP" }` | Post a new classified ad. Content is moderated. Images must be pre-uploaded via the media router. |
| `classified.update` | mutation | protected (owner) | `{ classifiedId: string; title?: string; description?: string; price?: number; images?: string[]; status?: "ACTIVE" \| "SOLD" \| "EXPIRED" }` | Update a classified ad. Only the owner can update. |
| `classified.delete` | mutation | protected (owner or moderator) | `{ classifiedId: string; reason?: string }` | Soft-delete a classified ad. |
| `classified.toggleFavorite` | mutation | protected | `{ classifiedId: string }` | Add or remove a classified ad from the user's favorites. Toggles the current state. |
| `classified.getFavorites` | query | protected | `{ cursor?: string; limit?: number }` | List the authenticated user's favorited classifieds. |
| `classified.revealContact` | mutation | protected | `{ classifiedId: string }` | Reveal the seller's contact information. Tracked for analytics (contact reveal count). Returns the contact details based on the seller's chosen contact method. |

---

#### `portfolioRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `portfolio.get` | query | public | `{ username: string }` | Get a user's full portfolio page by username, including bio, skills, all projects, and aggregate stats. |
| `portfolio.update` | mutation | protected (owner) | `{ headline?: string; bio?: string; skills?: string[]; customDomain?: string; theme?: string }` | Update the portfolio page metadata. |
| `portfolio.createProject` | mutation | protected (portfolio limit check) | `{ title: string; description: string; category: string; tags?: string[]; url?: string; images?: string[] }` | Add a project to the portfolio. Enforces per-tier project limits (FREE: 3, PROFESSIONAL+: unlimited). |
| `portfolio.updateProject` | mutation | protected (owner) | `{ projectId: string; title?: string; description?: string; category?: string; tags?: string[]; url?: string; images?: string[] }` | Update an existing portfolio project. |
| `portfolio.deleteProject` | mutation | protected (owner) | `{ projectId: string }` | Delete a portfolio project and its associated media. |
| `portfolio.addMedia` | mutation | protected (owner) | `{ projectId: string; mediaUrl: string; type: "IMAGE" \| "VIDEO"; caption?: string; sortOrder?: number }` | Add a media item (image or video) to a portfolio project. |
| `portfolio.removeMedia` | mutation | protected (owner) | `{ mediaId: string }` | Remove a media item from a portfolio project. Also deletes the file from Supabase Storage. |
| `portfolio.likeProject` | mutation | protected | `{ projectId: string }` | Like or unlike a portfolio project. Toggles the current state. |
| `portfolio.listComments` | query | public | `{ projectId: string; cursor?: string; limit?: number }` | List comments on a portfolio project. |
| `portfolio.createComment` | mutation | protected + moderation | `{ projectId: string; content: string }` | Add a comment to a portfolio project. Content is moderated. |

---

#### `courseRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `course.list` | query | public | `{ cursor?: string; limit?: number; category?: string; level?: "BEGINNER" \| "INTERMEDIATE" \| "ADVANCED"; pricing?: "FREE" \| "PAID"; sort?: "newest" \| "popular" \| "rating" }` | Browse the course catalog with filters and pagination. |
| `course.getBySlug` | query | public | `{ slug: string }` | Get the course landing page: title, description, instructor, syllabus outline, reviews, enrollment count, and pricing. |
| `course.create` | mutation | protected (BUSINESS+) | `{ title: string; description: string; category: string; level: "BEGINNER" \| "INTERMEDIATE" \| "ADVANCED"; pricing: { type: "FREE" \| "PAID"; price?: number; currency?: "ILS" \| "USD" }; thumbnail?: string }` | Create a new course. Requires BUSINESS membership or above. Course starts in DRAFT status. |
| `course.update` | mutation | protected (instructor) | `{ courseId: string; title?: string; description?: string; status?: "DRAFT" \| "PUBLISHED" \| "ARCHIVED"; pricing?: { type: "FREE" \| "PAID"; price?: number } }` | Update course details. Only the course instructor can update. Publishing triggers a review process. |
| `course.createModule` | mutation | protected (instructor) | `{ courseId: string; title: string; description?: string; sortOrder: number }` | Add a module (section) to a course. |
| `course.createLesson` | mutation | protected (instructor) | `{ moduleId: string; title: string; type: "VIDEO" \| "TEXT" \| "QUIZ"; content?: string; videoUrl?: string; duration?: number; isFree?: boolean; sortOrder: number }` | Add a lesson to a module. Lessons marked `isFree` are accessible without enrollment. |
| `course.updateLesson` | mutation | protected (instructor) | `{ lessonId: string; title?: string; content?: string; videoUrl?: string; duration?: number; isFree?: boolean }` | Update a lesson's content or metadata. |
| `course.enroll` | mutation | protected | `{ courseId: string; paymentMethodId?: string }` | Enroll in a course. For paid courses, processes payment via Stripe. For free courses, enrollment is immediate. Returns `{ enrollmentId: string }`. |
| `course.getProgress` | query | protected (enrolled student) | `{ courseId: string }` | Get the authenticated user's progress in a course: completed lessons, quiz scores, overall percentage, and estimated time remaining. |
| `course.updateLessonProgress` | mutation | protected (enrolled) | `{ lessonId: string; completed: boolean; quizScore?: number }` | Mark a lesson as completed or update quiz score. Recalculates overall course progress. |
| `course.getLessonContent` | query | protected (enrolled or free lesson) | `{ lessonId: string }` | Get the full lesson content. Requires enrollment unless the lesson is marked as free. Signed video URLs expire after 4 hours. |
| `course.createReview` | mutation | protected (enrolled) | `{ courseId: string; rating: number; comment: string }` | Leave a review for a course. Only enrolled students can review. One review per student. Rating is 1-5. |
| `course.getCertificate` | query | protected (completed) | `{ courseId: string }` | Generate or retrieve a completion certificate. Requires 100% lesson completion. Returns a signed PDF URL. |

---

#### `articleRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `article.list` | query | public | `{ cursor?: string; limit?: number; category?: string; authorId?: string; editorsPick?: boolean; sort?: "newest" \| "popular" }` | List published articles with filters and pagination. |
| `article.getBySlug` | query | public | `{ slug: string }` | Get a single article by slug with full content, author info, and comments count. Increments view counter. |
| `article.create` | mutation | protected + moderation | `{ title: string; content: string; excerpt?: string; category: string; tags?: string[]; coverImage?: string }` | Publish a new article. Content passes through moderation middleware. |
| `article.update` | mutation | protected (author) | `{ articleId: string; title?: string; content?: string; excerpt?: string; category?: string; tags?: string[]; coverImage?: string }` | Update an existing article. Only the original author can edit. |
| `article.delete` | mutation | protected (author or moderator) | `{ articleId: string; reason?: string }` | Soft-delete an article. |
| `article.listComments` | query | public | `{ articleId: string; cursor?: string; limit?: number }` | List comments on an article with pagination. |
| `article.createComment` | mutation | protected + moderation | `{ articleId: string; content: string; replyToId?: string }` | Add a comment to an article. Supports nested replies. Content is moderated. |
| `article.toggleEditorsPick` | mutation | admin | `{ articleId: string }` | Toggle the "Editor's Pick" flag on an article. Editor's picks are featured prominently on the homepage. |

---

#### `messageRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `message.listConversations` | query | protected | `{ cursor?: string; limit?: number }` | List the authenticated user's conversations, ordered by most recent message. Includes unread count per conversation. |
| `message.getConversation` | query | protected (participant only) | `{ conversationId: string; cursor?: string; limit?: number }` | Get messages in a conversation. Only participants can access. Returns paginated messages in chronological order. |
| `message.createConversation` | mutation | protected (daily limit check) | `{ participantIds: string[]; initialMessage: string }` | Start a new conversation. Enforces daily message limits per tier (FREE: 5/day, PROFESSIONAL: 50/day, BUSINESS+: unlimited). |
| `message.sendMessage` | mutation | protected (participant only) | `{ conversationId: string; content: string; attachments?: string[] }` | Send a message in an existing conversation. Only participants can send. Triggers push/email notification to other participants. |
| `message.markRead` | mutation | protected (participant only) | `{ conversationId: string }` | Mark all messages in a conversation as read. Updates the unread counter. |

---

#### `notificationRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `notification.list` | query | protected | `{ cursor?: string; limit?: number; unreadOnly?: boolean; type?: string }` | List the authenticated user's notifications with pagination and optional filters. |
| `notification.markRead` | mutation | protected | `{ notificationId: string }` | Mark a single notification as read. |
| `notification.markAllRead` | mutation | protected | `void` | Mark all of the authenticated user's notifications as read. |
| `notification.getUnreadCount` | query | protected | `void` | Get the total unread notification count. Used to render the badge in the UI. Cached in Redis with a 30-second TTL. |
| `notification.updatePreferences` | mutation | protected | `{ email?: Record<string, boolean>; push?: Record<string, boolean>; whatsapp?: Record<string, boolean> }` | Update notification preferences by channel and event type. Each key in the record is a notification type (e.g. `"thread_reply"`, `"new_follower"`). |

---

#### `searchRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `search.query` | query | public | `{ q: string; index?: "threads" \| "portfolios" \| "professionals" \| "courses" \| "articles" \| "classifieds"; cursor?: string; limit?: number; filters?: Record<string, string \| string[]> }` | Unified search across a single Meilisearch index. Returns ranked results with highlights. |
| `search.federated` | query | public | `{ q: string; indexes?: string[]; limit?: number }` | Multi-index federated search. Queries multiple indexes simultaneously and returns grouped results. Used for the global search bar. |
| `search.suggest` | query | public | `{ q: string; limit?: number }` | Autocomplete suggestions based on partial input. Returns up to 5 suggestions per index with highlighted matching segments. |
| `search.semantic` | query | protected (PROFESSIONAL+) | `{ q: string; index: string; limit?: number }` | AI-powered semantic search. Converts the query to an embedding using OpenAI and performs a nearest-neighbour search against precomputed document embeddings. Requires PROFESSIONAL membership. |

---

#### `adRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `ad.create` | mutation | protected | `{ title: string; imageUrl: string; targetUrl: string; placement: "SIDEBAR" \| "BANNER" \| "IN_FEED" \| "FORUM_HEADER"; budget: number; currency: "ILS" \| "USD"; startDate: Date; endDate: Date; targeting?: { forums?: string[]; professions?: string[]; locations?: string[] } }` | Create a new self-serve ad campaign. Ad goes into review before activation. |
| `ad.update` | mutation | protected (owner) | `{ adId: string; title?: string; imageUrl?: string; targetUrl?: string; budget?: number; status?: "ACTIVE" \| "PAUSED" }` | Update an ad campaign. Only the ad owner can update. |
| `ad.getForPlacement` | query | public | `{ placement: "SIDEBAR" \| "BANNER" \| "IN_FEED" \| "FORUM_HEADER"; forumId?: string; limit?: number }` | Get ads to display in a specific placement. Selection is weighted by budget remaining and targeting relevance. Returns ad creative and tracking URLs. |
| `ad.trackImpression` | mutation | public | `{ adId: string; placement: string; sessionId?: string }` | Record an ad impression. Anonymous, no auth required. Debounced to one impression per session per 30 minutes. |
| `ad.trackClick` | mutation | public | `{ adId: string; placement: string; sessionId?: string }` | Record an ad click. Anonymous, no auth required. Returns the target redirect URL. |
| `ad.getStats` | query | protected (owner) | `{ adId: string; dateRange?: { from: Date; to: Date } }` | Get ad performance metrics: impressions, clicks, CTR, spend, and daily breakdown. Only the ad owner can access. |

---

#### `moderationRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `moderation.getQueue` | query | moderator | `{ status?: "PENDING" \| "IN_REVIEW"; type?: "THREAD" \| "POST" \| "ARTICLE" \| "CLASSIFIED" \| "PROJECT" \| "COMMENT"; cursor?: string; limit?: number }` | Get the moderation queue. Shows content items awaiting review, sorted by priority (auto-flagged items first). |
| `moderation.approve` | mutation | moderator | `{ itemId: string; type: string; note?: string }` | Approve a moderation queue item. Makes the content publicly visible. |
| `moderation.reject` | mutation | moderator | `{ itemId: string; type: string; reason: string; notifyAuthor?: boolean }` | Reject a moderation queue item. Content remains hidden. Optionally notifies the author with the rejection reason. |
| `moderation.listReports` | query | moderator | `{ status?: "OPEN" \| "IN_REVIEW" \| "RESOLVED" \| "DISMISSED"; cursor?: string; limit?: number }` | List user-submitted content reports. |
| `moderation.resolveReport` | mutation | moderator | `{ reportId: string; action: "REMOVE_CONTENT" \| "WARN_USER" \| "SUSPEND_USER" \| "DISMISS"; note: string }` | Resolve a user report by taking an action. All resolutions are logged in an audit trail. |

---

#### `adminRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `admin.getDashboardStats` | query | admin | `{ dateRange?: { from: Date; to: Date } }` | Get platform-wide statistics: total users, active users (DAU/MAU), new registrations, content counts, revenue, and engagement metrics. |
| `admin.listUsers` | query | admin | `{ cursor?: string; limit?: number; search?: string; role?: string; status?: string; membershipTier?: string; sort?: "newest" \| "reputation" \| "lastActive" }` | List and search platform users with filters. Returns user details including role, status, membership, and activity summary. |
| `admin.updateUserRole` | mutation | super_admin | `{ userId: string; role: "USER" \| "MODERATOR" \| "ADMIN" \| "SUPER_ADMIN" }` | Change a user's role. Only super-admins can assign roles. Logged in audit trail. |
| `admin.updateUserStatus` | mutation | admin | `{ userId: string; status: "ACTIVE" \| "SUSPENDED" \| "BANNED"; reason: string; duration?: number }` | Suspend or ban a user. Suspension can be temporary (duration in days) or permanent (ban). Sends notification to the user. |
| `admin.getSystemConfig` | query | super_admin | `void` | Get current system configuration: feature flags, rate limits, moderation thresholds, maintenance mode, etc. |
| `admin.updateSystemConfig` | mutation | super_admin | `{ key: string; value: unknown }` | Update a system configuration value. Changes take effect immediately. All changes are logged in audit trail. |

---

#### `mediaRouter`

| Procedure | Type | Auth Level | Input Schema | Description |
|-----------|------|------------|-------------|-------------|
| `media.getSignedUrl` | mutation | protected | `{ fileName: string; contentType: string; sizeBytes: number; purpose: "AVATAR" \| "PORTFOLIO" \| "THREAD" \| "ARTICLE" \| "CLASSIFIED" \| "COURSE" \| "MESSAGE" \| "AD" }` | Generate a Supabase Storage signed upload URL. Validates file type and size limits per purpose. Returns `{ signedUrl: string; path: string; expiresAt: Date }`. |
| `media.confirmUpload` | mutation | protected | `{ path: string; purpose: string }` | Confirm that a file upload has completed. Triggers background processing: image optimisation (Sharp), thumbnail generation, virus scanning, and metadata extraction. Returns `{ mediaId: string; publicUrl: string; thumbnailUrl?: string }`. |

---

## 3. REST API (Public)

The REST API is served under `/api/v1/` and is designed for public consumers that cannot use the tRPC protocol. All REST endpoints return JSON with consistent envelope formatting. These endpoints are read-only (except webhooks) and do not require authentication.

### Base URL

```
Production:  https://kehilapro.com/api/v1
Staging:     https://staging.kehilapro.com/api/v1
```

### Standard Response Envelope

```json
{
  "ok": true,
  "data": { ... },
  "meta": {
    "cursor": "eyJpZCI6...",
    "hasMore": true,
    "total": 1234
  }
}
```

### Error Response Envelope

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "The requested resource was not found."
  }
}
```

---

### GET `/api/v1/threads`

Public thread listing with pagination and filters.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `forumId` | string | — | Filter by forum ID |
| `cursor` | string | — | Cursor for pagination |
| `limit` | number | 20 | Items per page (max 50) |
| `sort` | string | `"latest"` | Sort order: `latest`, `popular`, `unanswered` |
| `tag` | string | — | Filter by tag |

**Example Request:**

```http
GET /api/v1/threads?forumId=clx1234&limit=10&sort=popular HTTP/1.1
Host: kehilapro.com
Accept: application/json
```

**Example Response:**

```json
{
  "ok": true,
  "data": [
    {
      "id": "clx5678",
      "slug": "best-tools-for-remote-work-2026",
      "title": "Best Tools for Remote Work 2026",
      "excerpt": "I've been working remotely for 3 years and wanted to share...",
      "author": {
        "id": "usr_abc123",
        "displayName": "Moshe K.",
        "avatar": "https://cdn.kehilapro.com/avatars/usr_abc123.webp"
      },
      "forum": {
        "id": "clx1234",
        "name": "Technology",
        "slug": "technology"
      },
      "format": "DISCUSSION",
      "tags": ["remote-work", "productivity"],
      "postCount": 47,
      "viewCount": 1230,
      "isPinned": false,
      "isLocked": false,
      "createdAt": "2026-02-18T14:30:00.000Z",
      "lastActivityAt": "2026-02-21T09:15:00.000Z"
    }
  ],
  "meta": {
    "cursor": "eyJpZCI6ImNseDU2NzgifQ",
    "hasMore": true,
    "total": 342
  }
}
```

---

### GET `/api/v1/threads/:slug`

Single thread with its posts.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `slug` | string | Thread URL slug |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `postCursor` | string | — | Cursor for post pagination |
| `postLimit` | number | 20 | Posts per page (max 50) |

**Example Request:**

```http
GET /api/v1/threads/best-tools-for-remote-work-2026?postLimit=5 HTTP/1.1
Host: kehilapro.com
Accept: application/json
```

**Example Response:**

```json
{
  "ok": true,
  "data": {
    "id": "clx5678",
    "slug": "best-tools-for-remote-work-2026",
    "title": "Best Tools for Remote Work 2026",
    "content": "I've been working remotely for 3 years and wanted to share my favorite tools...",
    "author": {
      "id": "usr_abc123",
      "displayName": "Moshe K.",
      "avatar": "https://cdn.kehilapro.com/avatars/usr_abc123.webp",
      "reputation": 1250
    },
    "forum": {
      "id": "clx1234",
      "name": "Technology",
      "slug": "technology"
    },
    "format": "DISCUSSION",
    "tags": ["remote-work", "productivity"],
    "postCount": 47,
    "viewCount": 1231,
    "isPinned": false,
    "isLocked": false,
    "createdAt": "2026-02-18T14:30:00.000Z",
    "lastActivityAt": "2026-02-21T09:15:00.000Z",
    "posts": [
      {
        "id": "post_001",
        "content": "Great list! I'd also recommend Notion for project management...",
        "author": {
          "id": "usr_def456",
          "displayName": "Yosef B.",
          "avatar": "https://cdn.kehilapro.com/avatars/usr_def456.webp",
          "reputation": 890
        },
        "reactions": {
          "LIKE": 12,
          "HELPFUL": 5,
          "INSIGHTFUL": 3,
          "FUNNY": 0
        },
        "isAcceptedAnswer": false,
        "createdAt": "2026-02-18T15:10:00.000Z",
        "editedAt": null
      }
    ],
    "postMeta": {
      "cursor": "eyJpZCI6InBvc3RfMDAxIn0",
      "hasMore": true
    }
  }
}
```

---

### GET `/api/v1/portfolios/:slug`

Public portfolio view by username slug.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `slug` | string | Username or portfolio slug |

**Example Request:**

```http
GET /api/v1/portfolios/david-cohen HTTP/1.1
Host: kehilapro.com
Accept: application/json
```

**Example Response:**

```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "usr_ghi789",
      "displayName": "David Cohen",
      "username": "david-cohen",
      "avatar": "https://cdn.kehilapro.com/avatars/usr_ghi789.webp",
      "headline": "Full-Stack Developer | React & Node.js Specialist",
      "bio": "10+ years of experience building web applications...",
      "skills": ["React", "Node.js", "TypeScript", "PostgreSQL", "AWS"],
      "location": "Jerusalem, Israel",
      "reputation": 2340
    },
    "projects": [
      {
        "id": "proj_001",
        "title": "E-Commerce Platform",
        "description": "Built a full-featured e-commerce platform for a local retailer...",
        "category": "Web Development",
        "tags": ["react", "node.js", "stripe"],
        "images": [
          {
            "url": "https://cdn.kehilapro.com/portfolio/proj_001/hero.webp",
            "thumbnail": "https://cdn.kehilapro.com/portfolio/proj_001/hero_thumb.webp",
            "caption": "Dashboard overview"
          }
        ],
        "url": "https://example-store.com",
        "likeCount": 23,
        "commentCount": 5,
        "createdAt": "2025-11-10T08:00:00.000Z"
      }
    ],
    "stats": {
      "totalProjects": 8,
      "totalLikes": 156,
      "totalViews": 4200
    }
  }
}
```

---

### GET `/api/v1/professionals`

Public professional directory search with filters.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | — | Search query (name, skill, headline) |
| `skills` | string | — | Comma-separated skill filter |
| `location` | string | — | Location filter |
| `availability` | string | — | `AVAILABLE`, `BUSY`, `UNAVAILABLE` |
| `minRating` | number | — | Minimum average rating (1-5) |
| `cursor` | string | — | Cursor for pagination |
| `limit` | number | 20 | Items per page (max 50) |
| `sort` | string | `"relevance"` | Sort: `relevance`, `rating`, `reputation`, `newest` |

**Example Request:**

```http
GET /api/v1/professionals?skills=react,typescript&location=jerusalem&limit=5 HTTP/1.1
Host: kehilapro.com
Accept: application/json
```

**Example Response:**

```json
{
  "ok": true,
  "data": [
    {
      "id": "usr_ghi789",
      "displayName": "David Cohen",
      "username": "david-cohen",
      "avatar": "https://cdn.kehilapro.com/avatars/usr_ghi789.webp",
      "headline": "Full-Stack Developer | React & Node.js Specialist",
      "skills": ["React", "Node.js", "TypeScript", "PostgreSQL"],
      "location": "Jerusalem, Israel",
      "availability": "AVAILABLE",
      "hourlyRate": { "amount": 250, "currency": "ILS" },
      "rating": 4.8,
      "completedProjects": 12,
      "reputation": 2340
    }
  ],
  "meta": {
    "cursor": "eyJpZCI6InVzcl9naGk3ODkifQ",
    "hasMore": true,
    "total": 89
  }
}
```

---

### GET `/api/v1/courses`

Public course catalog.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `category` | string | — | Filter by category |
| `level` | string | — | `BEGINNER`, `INTERMEDIATE`, `ADVANCED` |
| `pricing` | string | — | `FREE` or `PAID` |
| `cursor` | string | — | Cursor for pagination |
| `limit` | number | 20 | Items per page (max 50) |
| `sort` | string | `"popular"` | Sort: `newest`, `popular`, `rating` |

**Example Request:**

```http
GET /api/v1/courses?category=web-development&level=BEGINNER&limit=5 HTTP/1.1
Host: kehilapro.com
Accept: application/json
```

**Example Response:**

```json
{
  "ok": true,
  "data": [
    {
      "id": "crs_001",
      "slug": "intro-to-react-for-beginners",
      "title": "Introduction to React for Beginners",
      "description": "Learn React from scratch with hands-on projects...",
      "instructor": {
        "id": "usr_ghi789",
        "displayName": "David Cohen",
        "avatar": "https://cdn.kehilapro.com/avatars/usr_ghi789.webp"
      },
      "category": "Web Development",
      "level": "BEGINNER",
      "pricing": { "type": "PAID", "price": 199, "currency": "ILS" },
      "thumbnail": "https://cdn.kehilapro.com/courses/crs_001/thumb.webp",
      "rating": 4.7,
      "reviewCount": 34,
      "enrollmentCount": 210,
      "moduleCount": 8,
      "lessonCount": 42,
      "totalDuration": 1260,
      "createdAt": "2025-09-01T10:00:00.000Z"
    }
  ],
  "meta": {
    "cursor": "eyJpZCI6ImNyc18wMDEifQ",
    "hasMore": true,
    "total": 23
  }
}
```

---

### GET `/api/v1/articles`

Public article listing.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `category` | string | — | Filter by category |
| `authorId` | string | — | Filter by author |
| `editorsPick` | boolean | — | Filter editor's picks |
| `cursor` | string | — | Cursor for pagination |
| `limit` | number | 20 | Items per page (max 50) |
| `sort` | string | `"newest"` | Sort: `newest`, `popular` |

**Example Request:**

```http
GET /api/v1/articles?editorsPick=true&limit=3 HTTP/1.1
Host: kehilapro.com
Accept: application/json
```

**Example Response:**

```json
{
  "ok": true,
  "data": [
    {
      "id": "art_001",
      "slug": "freelancing-in-israel-tax-guide-2026",
      "title": "Freelancing in Israel: Complete Tax Guide for 2026",
      "excerpt": "Everything you need to know about tax obligations as a freelancer in Israel...",
      "author": {
        "id": "usr_jkl012",
        "displayName": "Avi Goldstein",
        "avatar": "https://cdn.kehilapro.com/avatars/usr_jkl012.webp"
      },
      "category": "Business & Finance",
      "tags": ["freelancing", "taxes", "israel"],
      "coverImage": "https://cdn.kehilapro.com/articles/art_001/cover.webp",
      "isEditorsPick": true,
      "viewCount": 3450,
      "commentCount": 28,
      "createdAt": "2026-02-15T08:00:00.000Z"
    }
  ],
  "meta": {
    "cursor": "eyJpZCI6ImFydF8wMDEifQ",
    "hasMore": true,
    "total": 12
  }
}
```

---

### POST `/api/v1/webhooks/stripe`

Stripe webhook handler for payment events. Verifies the webhook signature using the Stripe signing secret before processing.

**Headers:**

| Header | Description |
|--------|-------------|
| `Stripe-Signature` | Stripe webhook signature (required) |

**Handled Events:**

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Activate membership or course enrollment |
| `invoice.payment_succeeded` | Renew membership subscription |
| `invoice.payment_failed` | Notify user, initiate grace period |
| `customer.subscription.deleted` | Downgrade membership to FREE |
| `account.updated` (Connect) | Update freelancer Stripe Connect status |
| `transfer.created` (Connect) | Record milestone payout |
| `charge.dispute.created` | Flag transaction, notify admin |

**Example Request:**

```http
POST /api/v1/webhooks/stripe HTTP/1.1
Host: kehilapro.com
Content-Type: application/json
Stripe-Signature: t=1708531200,v1=abc123...,v0=def456...

{
  "id": "evt_1234",
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_1234",
      "customer": "cus_1234",
      "metadata": {
        "userId": "usr_abc123",
        "purpose": "membership",
        "tier": "PROFESSIONAL"
      },
      "amount_total": 9900,
      "currency": "ils"
    }
  }
}
```

**Example Response:**

```json
{
  "ok": true,
  "data": {
    "received": true,
    "eventId": "evt_1234",
    "action": "membership_activated"
  }
}
```

---

### POST `/api/v1/webhooks/whatsapp`

WhatsApp webhook handler for inbound messages and delivery status updates. Used by the WhatsApp Business API integration for notification delivery confirmation and two-way messaging.

**Verification (GET):**

WhatsApp sends a GET request to verify the webhook URL during setup.

```http
GET /api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=MY_VERIFY_TOKEN&hub.challenge=CHALLENGE_STRING HTTP/1.1
Host: kehilapro.com
```

**Verification Response:**

```
CHALLENGE_STRING
```

**Inbound Webhook (POST):**

```http
POST /api/v1/webhooks/whatsapp HTTP/1.1
Host: kehilapro.com
Content-Type: application/json
X-Hub-Signature-256: sha256=abc123...

{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "BIZ_ACCOUNT_ID",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "972501234567",
              "phone_number_id": "PHONE_ID"
            },
            "statuses": [
              {
                "id": "wamid.1234",
                "status": "delivered",
                "timestamp": "1708531200",
                "recipient_id": "972509876543"
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

**Example Response:**

```json
{
  "ok": true,
  "data": {
    "received": true,
    "processedEntries": 1
  }
}
```

---

## 4. Error Handling

All errors across both the tRPC and REST surfaces follow a consistent format. tRPC errors use the built-in `TRPCError` class; REST errors use an equivalent JSON envelope.

### Standard Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | No valid authentication token provided. The user must sign in. |
| `FORBIDDEN` | 403 | The user is authenticated but lacks permission for this action (wrong role, suspended account, or insufficient membership tier). |
| `NOT_FOUND` | 404 | The requested resource does not exist or has been deleted. |
| `BAD_REQUEST` | 400 | The request payload is malformed or fails Zod validation. |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded. The `Retry-After` header indicates when the client can retry. |
| `MEMBERSHIP_REQUIRED` | 403 | The action requires a higher membership tier. The error payload includes `requiredTier` and `currentTier`. |
| `MODERATION_PENDING` | 202 | The content was accepted but is pending moderation review before becoming publicly visible. |
| `CONFLICT` | 409 | A conflicting state exists (e.g. duplicate enrollment, already following). |
| `INTERNAL_SERVER_ERROR` | 500 | An unexpected server error occurred. Details are logged but not exposed to the client. |

### Error Response Format

```typescript
// tRPC error shape (after errorFormatter)
interface TRPCErrorResponse {
  error: {
    message: string;
    code: string;           // e.g. "UNAUTHORIZED", "FORBIDDEN"
    data: {
      code: string;         // tRPC error code
      httpStatus: number;
      path?: string;        // procedure path, e.g. "thread.create"
      zodError?: {          // present only for BAD_REQUEST with Zod validation
        fieldErrors: Record<string, string[]>;
        formErrors: string[];
      };
      cause?: {             // optional structured cause
        type: string;       // e.g. "MEMBERSHIP_REQUIRED"
        requiredTier?: string;
        currentTier?: string;
        [key: string]: unknown;
      };
    };
  };
}
```

```typescript
// REST error shape
interface RESTErrorResponse {
  ok: false;
  error: {
    code: string;           // e.g. "NOT_FOUND"
    message: string;        // human-readable error message
    cause?: {               // optional structured metadata
      type: string;
      [key: string]: unknown;
    };
  };
}
```

### Example Error Responses

**Unauthorized (401):**

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Please sign in."
  }
}
```

**Membership Required (403):**

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "This feature requires a PROFESSIONAL membership or above.",
    "cause": {
      "type": "MEMBERSHIP_REQUIRED",
      "requiredTier": "PROFESSIONAL",
      "currentTier": "FREE"
    }
  }
}
```

**Validation Error (400):**

```json
{
  "ok": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation failed",
    "cause": {
      "type": "VALIDATION_ERROR",
      "fieldErrors": {
        "title": ["String must contain at least 5 characters"],
        "content": ["Required"]
      },
      "formErrors": []
    }
  }
}
```

**Rate Limited (429):**

```json
{
  "ok": false,
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Rate limit exceeded. Max 30 requests per 60s."
  }
}
```

---

## 5. Rate Limiting by Endpoint

Rate limits are enforced per user (authenticated) or per IP (anonymous) using a Redis sliding-window counter. When a limit is exceeded, the API returns HTTP 429 with a `Retry-After` header.

| Endpoint Category | Max Requests | Window | Key | Notes |
|-------------------|-------------|--------|-----|-------|
| **Auth** (login, register, password reset) | 5 | 1 min | IP | Prevents brute-force attacks |
| **Mutations** (create, update, delete) | 30 | 1 min | userId | Applies to all write operations |
| **Queries** (read operations) | 100 | 1 min | userId or IP | Standard read rate limit |
| **Search** (query, federated, suggest) | 20 | 1 min | userId or IP | Protects Meilisearch from abuse |
| **Upload** (media.getSignedUrl) | 10 | 1 min | userId | Prevents storage abuse |
| **Webhooks** (Stripe, WhatsApp) | 500 | 1 min | IP | High limit for webhook providers |
| **Admin** (admin panel operations) | 60 | 1 min | userId | Moderate limit for admin tools |

### Burst Protection

In addition to per-minute limits, a global burst protector rejects any single IP that sends more than **10 requests per second**. This protects against sudden traffic spikes and basic DDoS patterns.

### Rate Limit Headers

All responses include rate-limit headers:

```http
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 24
X-RateLimit-Reset: 1708531260
Retry-After: 45
```

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the current window |
| `X-RateLimit-Remaining` | Remaining requests in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
| `Retry-After` | Seconds until the client can retry (only present on 429 responses) |

---

## 6. Input Validation

Every tRPC procedure validates its input using a **Zod schema** before any business logic executes. Zod provides runtime type checking with excellent TypeScript inference, ensuring that the types used at the API boundary exactly match the types consumed by the business logic.

### Validation Principles

1. **Fail fast** — invalid input is rejected immediately with a structured error listing all field-level violations.
2. **Co-located schemas** — each router file defines its Zod schemas alongside the procedures that use them.
3. **Reusable primitives** — common patterns (slugs, pagination, IDs) are extracted into shared schemas.
4. **Sanitisation built-in** — string fields use `.trim()` and content fields pass through an HTML sanitiser transform.

### Shared Schema Primitives

```typescript
// packages/api/src/schemas/shared.ts

import { z } from "zod";

/** CUID2 identifier */
export const idSchema = z.string().cuid2();

/** URL-safe slug */
export const slugSchema = z
  .string()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format");

/** Cursor-based pagination */
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

/** Date range filter */
export const dateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
}).refine((d) => d.from <= d.to, {
  message: "'from' must be before or equal to 'to'",
});
```

### Example: Thread Creation Schema

```typescript
// packages/api/src/routers/thread.ts

import { z } from "zod";
import { router, moderatedProcedure } from "../trpc";
import { idSchema } from "../schemas/shared";
import { sanitizeHtml } from "@kp/utils/sanitize";

const createThreadSchema = z.object({
  /** ID of the forum to post in */
  forumId: idSchema,

  /** Thread title — must be 5-200 characters */
  title: z
    .string()
    .trim()
    .min(5, "Title must be at least 5 characters")
    .max(200, "Title must be at most 200 characters"),

  /** Thread body — HTML content, sanitised and limited to 50 000 characters */
  content: z
    .string()
    .trim()
    .min(20, "Content must be at least 20 characters")
    .max(50_000, "Content must be at most 50,000 characters")
    .transform((html) => sanitizeHtml(html)),

  /** Thread format */
  format: z.enum(["DISCUSSION", "QA", "ARTICLE"]).default("DISCUSSION"),

  /** Optional tags (max 5) */
  tags: z
    .array(z.string().trim().min(2).max(30))
    .max(5, "Maximum 5 tags allowed")
    .optional(),

  /** Optional poll (only for DISCUSSION format) */
  poll: z
    .object({
      question: z.string().trim().min(10).max(300),
      options: z
        .array(z.string().trim().min(1).max(100))
        .min(2, "Poll must have at least 2 options")
        .max(10, "Poll can have at most 10 options"),
      expiresAt: z.coerce.date().optional(),
    })
    .optional(),
});

export const threadRouter = router({
  create: moderatedProcedure
    .input(createThreadSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify the forum exists and user has access
      const forum = await ctx.prisma.forum.findUniqueOrThrow({
        where: { id: input.forumId },
      });

      // Check if the forum is gender-restricted
      if (
        forum.genderRestriction &&
        forum.genderRestriction !== ctx.user.gender
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this forum.",
        });
      }

      // Generate slug from title
      const slug = generateSlug(input.title);

      // Create the thread
      const thread = await ctx.prisma.thread.create({
        data: {
          slug,
          title: input.title,
          content: input.content,
          format: input.format,
          tags: input.tags ?? [],
          forumId: input.forumId,
          authorId: ctx.user.id,
          ...(input.poll && {
            poll: {
              create: {
                question: input.poll.question,
                options: {
                  create: input.poll.options.map((text, i) => ({
                    text,
                    sortOrder: i,
                  })),
                },
                expiresAt: input.poll.expiresAt,
              },
            },
          }),
        },
        include: {
          author: { select: { id: true, displayName: true, avatar: true } },
          forum: { select: { id: true, name: true, slug: true } },
          poll: { include: { options: true } },
        },
      });

      // Update search index
      await ctx.meilisearch.index("threads").addDocuments([
        {
          id: thread.id,
          title: thread.title,
          content: thread.content,
          tags: thread.tags,
          authorName: thread.author.displayName,
          forumName: thread.forum.name,
          createdAt: thread.createdAt.getTime(),
        },
      ]);

      return thread;
    }),

  // ... other procedures
});
```

### Validation Error Example

When a client submits invalid input, the response includes a structured breakdown of every field that failed validation:

```json
{
  "error": {
    "message": "Validation failed",
    "code": "BAD_REQUEST",
    "data": {
      "code": "BAD_REQUEST",
      "httpStatus": 400,
      "path": "thread.create",
      "zodError": {
        "fieldErrors": {
          "title": ["Title must be at least 5 characters"],
          "content": ["Content must be at least 20 characters"],
          "tags": ["Maximum 5 tags allowed"]
        },
        "formErrors": []
      }
    }
  }
}
```

This structure allows the client-side form to map errors directly to the corresponding input fields, providing instant and specific feedback to the user.

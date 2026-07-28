# 05 — Authentication & RBAC

> Authentication, authorization, role-based access control, and membership tiers

---

## 1. Authentication Provider — Supabase Auth

### 1.1 Supported Auth Methods

| Method | Implementation | Notes |
|--------|---------------|-------|
| Email + Password | Supabase Auth `signUp` / `signInWithPassword` | Primary method |
| Phone OTP | Supabase Auth `signInWithOtp` (SMS) | Secondary, used for verification |
| WhatsApp OTP | Custom via WhatsApp Cloud API + Supabase `admin.updateUser` | Phone verification during onboarding |

**No social logins** — approximately 85 % of Haredi users abstain from social media. Google/Facebook/GitHub OAuth buttons would be confusing or objectionable.

### 1.2 Registration Flow

```
┌──────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│  Step 1   │────▶│   Step 2      │────▶│    Step 3       │────▶│   Step 4      │
│  Email +  │     │  Phone        │     │   Profile       │     │   Welcome     │
│  Password │     │  Verification │     │   Setup         │     │   Tour        │
└──────────┘     └──────────────┘     └────────────────┘     └──────────────┘
                                                                      │
    Fields:          Channel:            Fields:                       │
    • email          • WhatsApp OTP      • displayName                 ▼
    • password       • SMS fallback      • username (slug)        Dashboard
    • gender                             • gender
      (required)                         • location (city)
                                         • avatar (optional)
                                         • bio (optional)
                                         • skills[] (optional)
```

### 1.3 JWT & Session Management

```typescript
// JWT payload (Supabase Auth)
{
  sub: "uuid",                    // Supabase user ID
  email: "user@example.com",
  phone: "+972501234567",
  role: "authenticated",          // Supabase default
  app_metadata: {
    role: "USER",                 // App role: USER | MODERATOR | ADMIN | SUPER_ADMIN
    membershipTier: "FREE",       // FREE | PROFESSIONAL | BUSINESS | ENTERPRISE
    gender: "MALE"                // Used for gender-restricted forums
  },
  user_metadata: {
    displayName: "ישראל כהן",
    username: "israel-cohen",
    avatarUrl: "/avatars/..."
  }
}
```

**Cookie configuration:**

| Property | Value |
|----------|-------|
| Name | `sb-<project-ref>-auth-token` |
| HttpOnly | `true` |
| Secure | `true` |
| SameSite | `Strict` |
| Path | `/` |
| Max-Age | 604800 (7 days) |

**Session refresh:** Supabase Auth middleware in Next.js `middleware.ts` refreshes the JWT on every request if within the refresh window.

```typescript
// apps/web/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh session — this updates the cookie if needed
  const { data: { user } } = await supabase.auth.getUser();

  // Protected routes
  const protectedPaths = ["/messages", "/settings", "/admin", "/marketplace/dashboard"];
  const isProtected = protectedPaths.some((p) => request.nextUrl.pathname.startsWith(p));

  if (isProtected && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Admin routes
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const role = user?.app_metadata?.role;
    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}
```

---

## 2. Role-Based Access Control (RBAC)

### 2.1 Roles

| Role | Description | Population |
|------|-------------|------------|
| `USER` | Standard registered user | ~99 % |
| `MODERATOR` | Content moderation, forum management | ~0.5 % |
| `ADMIN` | Full platform management, user management | ~0.1 % |
| `SUPER_ADMIN` | System configuration, billing, deployment | 1-2 people |

### 2.2 Permission Matrix

| Permission | USER | MODERATOR | ADMIN | SUPER_ADMIN |
|------------|------|-----------|-------|-------------|
| Read public content | ✓ | ✓ | ✓ | ✓ |
| Create posts/threads | ✓ | ✓ | ✓ | ✓ |
| Edit own content | ✓ | ✓ | ✓ | ✓ |
| Delete own content | ✓ | ✓ | ✓ | ✓ |
| Report content | ✓ | ✓ | ✓ | ✓ |
| Edit any content | ✗ | ✓ (assigned forums) | ✓ | ✓ |
| Delete any content | ✗ | ✓ (assigned forums) | ✓ | ✓ |
| View moderation queue | ✗ | ✓ | ✓ | ✓ |
| Approve/reject content | ✗ | ✓ | ✓ | ✓ |
| Ban users | ✗ | ✗ | ✓ | ✓ |
| Manage forums | ✗ | ✗ | ✓ | ✓ |
| Manage ads | ✗ | ✗ | ✓ | ✓ |
| View analytics | ✗ | ✗ | ✓ | ✓ |
| Manage users | ✗ | ✗ | ✓ | ✓ |
| System configuration | ✗ | ✗ | ✗ | ✓ |
| Manage billing | ✗ | ✗ | ✗ | ✓ |
| Assign roles | ✗ | ✗ | ✗ | ✓ |

### 2.3 tRPC Authorization Middleware

```typescript
// packages/api/src/trpc.ts

import { initTRPC, TRPCError } from "@trpc/server";
import type { Role, MembershipTier } from "@prisma/client";

// Base procedure — no auth required
export const publicProcedure = t.procedure;

// Authenticated procedure — any logged-in user
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.session.user } });
});

// Role-restricted procedure factory
export const roleProtectedProcedure = (allowedRoles: Role[]) =>
  protectedProcedure.use(async ({ ctx, next }) => {
    if (!allowedRoles.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({ ctx });
  });

// Membership-gated procedure factory
export const membershipProcedure = (requiredTiers: MembershipTier[]) =>
  protectedProcedure.use(async ({ ctx, next }) => {
    if (!requiredTiers.includes(ctx.user.membership.tier)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "MEMBERSHIP_REQUIRED",
        cause: { requiredTiers },
      });
    }
    return next({ ctx });
  });

// Moderator procedure
export const moderatorProcedure = roleProtectedProcedure([
  "MODERATOR", "ADMIN", "SUPER_ADMIN",
]);

// Admin procedure
export const adminProcedure = roleProtectedProcedure([
  "ADMIN", "SUPER_ADMIN",
]);

// Super admin procedure
export const superAdminProcedure = roleProtectedProcedure(["SUPER_ADMIN"]);
```

### 2.4 Gender-Restricted Forums

Certain forums are restricted by gender (e.g., women-only discussion sections moderated by women moderators).

```typescript
// packages/api/src/routers/forum.ts

// Gender access check
const checkForumAccess = async (forumId: string, userId: string, db: PrismaClient) => {
  const forum = await db.forum.findUniqueOrThrow({
    where: { id: forumId },
    select: { accessLevel: true, genderRestriction: true, requiredMembership: true },
  });

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { gender: true, membership: { select: { tier: true } } },
  });

  // Gender restriction
  if (forum.genderRestriction && forum.genderRestriction !== user.gender) {
    throw new TRPCError({ code: "FORBIDDEN", message: "GENDER_RESTRICTED" });
  }

  // Membership restriction
  if (forum.requiredMembership) {
    const tierOrder = ["FREE", "PROFESSIONAL", "BUSINESS", "ENTERPRISE"];
    const userTierIndex = tierOrder.indexOf(user.membership.tier);
    const requiredTierIndex = tierOrder.indexOf(forum.requiredMembership);
    if (userTierIndex < requiredTierIndex) {
      throw new TRPCError({ code: "FORBIDDEN", message: "MEMBERSHIP_REQUIRED" });
    }
  }
};
```

---

## 3. Row-Level Security (RLS)

RLS policies on Supabase PostgreSQL serve as defense-in-depth — they enforce access control at the database level even if application code has a bug.

### 3.1 Key RLS Policies

```sql
-- Users can only update their own profile
CREATE POLICY "users_update_own" ON "User"
  FOR UPDATE USING (auth.uid()::text = "supabaseAuthId")
  WITH CHECK (auth.uid()::text = "supabaseAuthId");

-- Users can only see approved content (or their own pending content)
CREATE POLICY "posts_select_approved_or_own" ON "Post"
  FOR SELECT USING (
    "moderationStatus" = 'APPROVED'
    OR "authorId" = (SELECT id FROM "User" WHERE "supabaseAuthId" = auth.uid()::text)
  );

-- Users can only update their own posts
CREATE POLICY "posts_update_own" ON "Post"
  FOR UPDATE USING (
    "authorId" = (SELECT id FROM "User" WHERE "supabaseAuthId" = auth.uid()::text)
  );

-- Gender-restricted forums
CREATE POLICY "forum_gender_access" ON "Thread"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Forum" f
      JOIN "User" u ON u."supabaseAuthId" = auth.uid()::text
      WHERE f.id = "Thread"."forumId"
      AND (f."genderRestriction" IS NULL OR f."genderRestriction" = u.gender)
    )
  );

-- Messages: only participants can read
CREATE POLICY "messages_participant_only" ON "Message"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "ConversationParticipant" cp
      JOIN "User" u ON u.id = cp."userId"
      WHERE cp."conversationId" = "Message"."conversationId"
      AND u."supabaseAuthId" = auth.uid()::text
    )
  );

-- Moderators can read all content in their assigned forums
CREATE POLICY "moderator_full_read" ON "Post"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."supabaseAuthId" = auth.uid()::text
      AND u.role IN ('MODERATOR', 'ADMIN', 'SUPER_ADMIN')
    )
  );

-- Admins bypass all read restrictions
CREATE POLICY "admin_full_access" ON "User"
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."supabaseAuthId" = auth.uid()::text
      AND u.role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );
```

---

## 4. Membership Tiers

### 4.1 Tier Comparison

| Feature | Free | Professional (₪49/mo) | Business (₪99/mo) | Enterprise (custom) |
|---------|------|----------------------|-------------------|--------------------|
| **Forums** | Open forums only | All forums | All forums | All forums |
| **Threads/month** | 10 | Unlimited | Unlimited | Unlimited |
| **Portfolio items** | 3 (5 MB each) | Unlimited (20 MB) | Unlimited (50 MB) | Unlimited (100 MB) |
| **Marketplace** | Browse only | Full access | Full + featured listing | Full + priority |
| **Classifieds** | 2 active | 10 active | Unlimited | Unlimited |
| **AI tools** | None | Search + recommendations | All AI features | All + custom |
| **Analytics** | None | Basic (views, clicks) | Full dashboard | Full + API |
| **Course creation** | No | No | Yes (rev share 85/15) | Yes (rev share 90/10) |
| **Direct messages** | 5/day | 50/day | Unlimited | Unlimited |
| **Storage** | 100 MB | 5 GB | 20 GB | 100 GB |
| **Priority support** | No | Email | Email + WhatsApp | Dedicated |
| **Verified badge** | No | ✓ | ✓ | ✓ |
| **Custom domain** | No | No | No | ✓ |
| **API access** | No | No | Read-only | Full |

### 4.2 Stripe Integration

```typescript
// packages/payments/src/subscriptions.ts

const TIER_PRICE_MAP: Record<MembershipTier, string> = {
  FREE: "",
  PROFESSIONAL: "price_professional_monthly",   // ₪49/mo
  BUSINESS: "price_business_monthly",           // ₪99/mo
  ENTERPRISE: "",                               // Custom
};

// Create Stripe Checkout session for subscription
export async function createSubscriptionCheckout(
  userId: string,
  tier: MembershipTier,
  successUrl: string,
  cancelUrl: string,
) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { membership: true },
  });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: user.membership.stripeCustomerId ?? undefined,
    line_items: [{ price: TIER_PRICE_MAP[tier], quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId, tier },
    locale: "he",
    payment_method_types: ["card"],
  });

  return session;
}

// Webhook: update membership on successful payment
export async function handleSubscriptionEvent(event: Stripe.Event) {
  if (event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const { userId, tier } = subscription.metadata;

    await db.membership.update({
      where: { userId },
      data: {
        tier: tier as MembershipTier,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer as string,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        status: subscription.status === "active" ? "ACTIVE" : "PAST_DUE",
      },
    });
  }
}
```

### 4.3 Membership Check in tRPC

```typescript
// Example: marketplace access requires PROFESSIONAL+
export const marketplaceRouter = router({
  createProposal: membershipProcedure(["PROFESSIONAL", "BUSINESS", "ENTERPRISE"])
    .input(createProposalSchema)
    .mutation(async ({ ctx, input }) => {
      // Only PROFESSIONAL+ users can submit proposals
      return ctx.db.proposal.create({ data: { ...input, freelancerId: ctx.user.id } });
    }),

  browseProjects: protectedProcedure
    .input(browseProjectsSchema)
    .query(async ({ ctx, input }) => {
      // All users can browse, but contact info is hidden for FREE tier
      const projects = await ctx.db.project.findMany({ ... });
      if (ctx.user.membership.tier === "FREE") {
        return projects.map((p) => ({ ...p, clientEmail: null, clientPhone: null }));
      }
      return projects;
    }),
});
```

---

## 5. Feature Flags by Tier

Feature access is stored in the `Membership` model and checked via the `membershipProcedure` middleware or inline checks.

```typescript
// packages/db/prisma/schema.prisma (Membership model excerpt)

model Membership {
  id                    String          @id @default(cuid())
  userId                String          @unique
  user                  User            @relation(fields: [userId], references: [id])
  tier                  MembershipTier  @default(FREE)

  // Stripe
  stripeCustomerId      String?
  stripeSubscriptionId  String?
  currentPeriodStart    DateTime?
  currentPeriodEnd      DateTime?
  status                MembershipStatus @default(ACTIVE)

  // Feature flags (denormalized for fast checks)
  canAccessMarketplace  Boolean         @default(false)
  canAccessAllForums    Boolean         @default(false)
  hasAiTools            Boolean         @default(false)
  hasAnalytics          Boolean         @default(false)
  canCreateCourses      Boolean         @default(false)
  hasVerifiedBadge      Boolean         @default(false)
  maxPortfolioItems     Int             @default(3)
  maxClassifieds        Int             @default(2)
  maxDailyMessages      Int             @default(5)
  maxStorageMb          Int             @default(100)

  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt
}
```

---

## 6. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| JWT tampering | Supabase Auth verifies JWTs server-side; RLS uses `auth.uid()` |
| Privilege escalation | Role stored in `app_metadata` (not `user_metadata`); only Supabase service role can modify |
| Session hijacking | HTTP-only, Secure, SameSite=Strict cookies; short JWT expiry |
| CSRF | SameSite=Strict cookies + tRPC POST-only mutations |
| Brute force | Rate limiting on auth endpoints (see 13-SECURITY.md) |
| Account enumeration | Generic error messages on login/register failures |
| Phone verification bypass | OTP expiry (5 min), max 3 attempts, cooldown period |

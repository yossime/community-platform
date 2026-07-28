# 13 — Security

> Content moderation, rate limiting, Israel IPPL compliance, input sanitization, and image moderation

---

## 1. Content Moderation Pipeline

### 1.1 Three-Stage Pipeline Overview

Every piece of user-generated content (UGC) passes through a moderation pipeline before becoming publicly visible.

```
User input
    │
    ▼
┌─────────────────────────────────────┐
│  Stage 1: INPUT SANITIZATION         │
│                                      │
│  1. Zod schema validation            │
│  2. HTML sanitization (DOMPurify)    │
│  3. Plain text extraction for AI     │
│  4. URL validation & domain check    │
│  5. Parameterized DB queries         │
│  6. CSRF token verification          │
│                                      │
│  → Reject malformed input instantly  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Stage 2: AI MODERATION (async)      │
│                                      │
│  Text:                               │
│  ├─ OpenAI Moderation API (free)     │
│  ├─ GPT-4o-mini (Haredi rules)      │
│  └─ Spam detection (heuristic)       │
│                                      │
│  Images:                             │
│  ├─ GPT-4o Vision (modesty check)    │
│  └─ Zero tolerance: women/girls      │
│                                      │
│  Decision:                           │
│  ├─ confidence ≥ 0.95 → auto-decide  │
│  └─ confidence < 0.95 → Stage 3      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Stage 3: HUMAN REVIEW              │
│                                      │
│  • Moderator dashboard               │
│  • Context: user history, content    │
│  • Actions: approve, reject, warn    │
│  • SLA: < 4 hours for flagged items  │
└─────────────────────────────────────┘
```

### 1.2 Moderation Status Flow

```
PENDING ──┬──▶ APPROVED ──▶ (visible)
          │
          ├──▶ FLAGGED ──┬──▶ APPROVED (human approved)
          │              │
          │              └──▶ REJECTED (human rejected)
          │
          └──▶ REJECTED ──▶ (hidden, user notified)
                 │
                 └──▶ REMOVED (admin hard-delete)
```

### 1.3 Content Types Under Moderation

| Content Type | Text Check | Image Check | Auto-Approve Threshold |
|-------------|-----------|-------------|----------------------|
| Forum posts | ✓ | ✓ (embedded images) | 0.95 |
| Thread titles | ✓ | — | 0.95 |
| Portfolio media | — | ✓ (mandatory) | Never (always reviewed if uncertain) |
| Classified listings | ✓ | ✓ | 0.95 |
| Article content | ✓ | ✓ | 0.90 (stricter for featured content) |
| Profile avatars | — | ✓ | 0.98 |
| Direct messages | ✓ (abuse only) | ✓ | 0.98 |
| Course content | ✓ | ✓ | 0.90 |

---

## 2. Rate Limiting

### 2.1 Implementation

Rate limiting uses the **sliding window** algorithm implemented in Redis (see `12-CACHING.md`).

### 2.2 Rate Limit Table

| Category | Identifier | Limit | Window | Response on Exceed |
|----------|-----------|-------|--------|-------------------|
| `auth:login` | IP | 5 | 60s | 429 + 60s cooldown |
| `auth:register` | IP | 3 | 3600s | 429 + 1h cooldown |
| `auth:otp` | phone | 3 | 300s | 429 + 5m cooldown |
| `auth:password_reset` | email | 3 | 3600s | 429 + 1h cooldown |
| `mutation:general` | userId | 30 | 60s | 429 |
| `mutation:thread_create` | userId | 10 | 3600s | 429 |
| `mutation:post_create` | userId | 30 | 600s | 429 |
| `query:general` | userId | 100 | 60s | 429 |
| `search` | userId or IP | 20 | 60s | 429 |
| `upload` | userId | 10 | 60s | 429 |
| `message:send` | userId | 30 | 60s | 429 |
| `ai:summarize` | userId | 10 | 60s | 429 |
| `classified:contact_reveal` | userId | 5 | 3600s | 429 |
| `data_export` | userId | 1 | 86400s | 429 |
| `webhook:stripe` | IP | 500 | 60s | 429 |
| `webhook:whatsapp` | IP | 500 | 60s | 429 |

### 2.3 Rate Limit Headers

```typescript
// Rate limit response headers (set in tRPC middleware)
{
  "X-RateLimit-Limit": "30",
  "X-RateLimit-Remaining": "28",
  "X-RateLimit-Reset": "1706886400",
  "Retry-After": "42"  // Only on 429 responses
}
```

---

## 3. Israel IPPL (Amendment 13) Compliance

The Israeli Privacy Protection Law (Amendment 13, effective 2025) imposes GDPR-like obligations.

### 3.1 Requirements & Implementation

| Requirement | Implementation |
|-------------|---------------|
| **Consent before processing** | `UserSettings.consentTracking`, `consentMarketing`, `consentAiProcessing` — opt-in checkboxes during registration |
| **Right to access** | `user.exportData` tRPC endpoint — generates JSON/CSV of all user data |
| **Right to deletion** | `user.deleteAccount` tRPC endpoint — anonymizes PII, deletes content, revokes sessions |
| **Data minimization** | Only collect necessary fields; optional fields clearly marked |
| **AI disclosure** | Banner on AI-moderated content: "תוכן זה עבר סינון אוטומטי" |
| **Purpose limitation** | Privacy policy defines each data use purpose |
| **Data breach notification** | 72-hour notification procedure to Israeli Privacy Authority |
| **Data Protection Officer** | Designated DPO contact in privacy policy |
| **Cross-border transfer** | All data stored in EU (Frankfurt) — no US transfer needed |

### 3.2 Data Export Implementation

```typescript
// packages/api/src/routers/user.ts

user.exportData = protectedProcedure
  .mutation(async ({ ctx }) => {
    const userId = ctx.user.id;

    // Rate limited: 1 per day
    const rateLimited = await checkRateLimit(userId, "data_export", 1, 86400);
    if (!rateLimited.allowed) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
    }

    // Collect all user data
    const data = {
      profile: await ctx.db.user.findUnique({
        where: { id: userId },
        include: {
          settings: true,
          membership: true,
          reputation: true,
          skills: { include: { tag: true } },
        },
      }),
      threads: await ctx.db.thread.findMany({ where: { authorId: userId } }),
      posts: await ctx.db.post.findMany({ where: { authorId: userId } }),
      messages: await ctx.db.message.findMany({ where: { senderId: userId } }),
      classifieds: await ctx.db.classifiedListing.findMany({ where: { authorId: userId } }),
      portfolio: await ctx.db.portfolio.findUnique({
        where: { userId },
        include: { projects: { include: { media: true } } },
      }),
      enrollments: await ctx.db.enrollment.findMany({ where: { userId } }),
      reviews: await ctx.db.review.findMany({ where: { reviewerId: userId } }),
      notifications: await ctx.db.notification.findMany({
        where: { userId },
        take: 1000,
        orderBy: { createdAt: "desc" },
      }),
    };

    // Generate downloadable JSON
    const exportUrl = await generateExportFile(data, userId);

    // Send via email
    await sendEmail({
      to: ctx.user.email,
      subject: "ייצוא הנתונים שלך מוכן",
      template: DataExportEmail({ exportUrl }),
    });

    return { status: "EXPORT_INITIATED" };
  });
```

### 3.3 Account Deletion

```typescript
user.deleteAccount = protectedProcedure
  .input(z.object({
    confirmation: z.literal("DELETE_MY_ACCOUNT"),
    reason: z.string().optional(),
  }))
  .mutation(async ({ ctx }) => {
    const userId = ctx.user.id;

    // 1. Anonymize user profile
    await ctx.db.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@platform.co.il`,
        phone: null,
        displayName: "משתמש שנמחק",
        username: `deleted-${userId}`,
        slug: `deleted-${userId}`,
        avatarUrl: null,
        coverUrl: null,
        bio: null,
        location: null,
        website: null,
        status: "DEACTIVATED",
      },
    });

    // 2. Delete private data
    await ctx.db.userSettings.delete({ where: { userId } });
    await ctx.db.message.deleteMany({ where: { senderId: userId } });

    // 3. Anonymize public content (keep for community value)
    await ctx.db.post.updateMany({
      where: { authorId: userId },
      data: { authorId: "DELETED_USER_PLACEHOLDER" },
    });

    // 4. Cancel Stripe subscription
    const membership = await ctx.db.membership.findUnique({ where: { userId } });
    if (membership?.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(membership.stripeSubscriptionId);
    }

    // 5. Delete from Supabase Auth
    await supabase.auth.admin.deleteUser(ctx.user.supabaseAuthId);

    // 6. Purge from search indexes
    await publishEvent("USER_DELETED", { userId });

    // 7. Delete storage files
    await purgeUserStorage(userId);

    return { status: "ACCOUNT_DELETED" };
  });
```

---

## 4. Input Sanitization (6 Layers)

### Layer 1: Zod Schema Validation

```typescript
// All tRPC inputs are validated with Zod
const createThreadSchema = z.object({
  forumId: z.string().cuid(),
  title: z.string().min(3).max(200).trim(),
  content: z.string().min(10).max(50000),
  tags: z.array(z.string()).max(10).optional(),
  format: z.enum(["FLAT", "THREADED", "QA"]).default("FLAT"),
});
```

### Layer 2: HTML Sanitization

```typescript
import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "blockquote",
  "ul", "ol", "li", "h2", "h3", "h4",
  "a", "code", "pre", "img",
];

const ALLOWED_ATTRS = {
  a: ["href", "title", "rel"],
  img: ["src", "alt", "width", "height"],
};

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: Object.values(ALLOWED_ATTRS).flat(),
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
  });
}
```

### Layer 3: Plain Text Extraction (for AI)

```typescript
import { convert } from "html-to-text";

export function extractPlainText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  });
}
```

### Layer 4: URL Validation

```typescript
const BLOCKED_DOMAINS = [
  "bit.ly", "tinyurl.com", "goo.gl",  // URL shorteners (hide destination)
  // Add known malicious domains
];

export function validateUrls(html: string): string {
  const urlRegex = /https?:\/\/[^\s"'<>]+/g;
  const urls = html.match(urlRegex) ?? [];

  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (BLOCKED_DOMAINS.includes(parsed.hostname)) {
        throw new Error(`Blocked domain: ${parsed.hostname}`);
      }
      // Force HTTPS
      if (parsed.protocol === "http:") {
        html = html.replace(url, url.replace("http:", "https:"));
      }
    } catch {
      // Remove invalid URLs
      html = html.replace(url, "[קישור הוסר]");
    }
  }

  return html;
}
```

### Layer 5: Parameterized Queries

All database queries use Prisma's parameterized queries (no raw string interpolation). Raw SQL uses `Prisma.sql` tagged templates.

```typescript
// SAFE — parameterized
const user = await db.user.findUnique({ where: { id: userId } });

// SAFE — tagged template
const results = await db.$queryRaw`
  SELECT * FROM "User" WHERE id = ${userId}
`;

// NEVER DO THIS — SQL injection risk
// const results = await db.$queryRawUnsafe(`SELECT * FROM "User" WHERE id = '${userId}'`);
```

### Layer 6: CSRF Protection

- tRPC mutations are POST-only (no GET mutations)
- `SameSite=Strict` cookies prevent cross-origin requests
- Webhook endpoints verify signatures (Stripe: `stripe-signature` header, WhatsApp: verify token)

---

## 5. Image Moderation — Zero Tolerance

See `08-AI-SERVICES.md` for full implementation. Key security points:

| Rule | Implementation |
|------|---------------|
| Images never visible before moderation | Uploaded to `/temp/` bucket (private), moved to public only after AI approval |
| Zero tolerance for women/girls | `containsWomen === true` → immediate reject, no human review needed |
| Monthly re-scanning | 5% of approved images re-checked monthly |
| User notification | User informed of rejection with reason (generic, not detailed to prevent gaming) |
| Audit trail | Every moderation decision logged in `ModerationLog` with AI confidence score |
| Fallback on AI failure | Default to FLAGGED (never auto-approve on error) |

---

## 6. HTTP Security Headers

```typescript
// apps/web/next.config.ts — headers
{
  source: "/(.*)",
  headers: [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-XSS-Protection", value: "0" }, // Disabled, rely on CSP
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js requires these
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self' wss://*.platform.co.il https://*.supabase.co",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(self)",
    },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
  ],
}
```

---

## 7. Authentication Security

| Concern | Mitigation |
|---------|-----------|
| Password strength | Minimum 8 characters, at least 1 number + 1 letter |
| Brute force | Rate limit: 5 attempts/minute, account lockout after 10 failures |
| Session hijacking | HTTP-only, Secure, SameSite=Strict cookies |
| JWT tampering | Server-side verification via Supabase Auth |
| Account enumeration | Generic error messages: "Invalid credentials" (not "User not found") |
| Phone verification | OTP expires in 5 minutes, max 3 attempts, 5-minute cooldown |
| Privilege escalation | Role in `app_metadata` (service role only can modify) |
| Session fixation | New session token on login, existing sessions revoked |

---

## 8. Dependency Security

| Practice | Tool |
|----------|------|
| Automated vulnerability scanning | `npm audit` in CI pipeline |
| Dependency updates | Dependabot weekly PRs |
| Lock file integrity | `pnpm install --frozen-lockfile` in CI |
| License compliance | `license-checker` in CI |
| Supply chain | Only use well-maintained, popular packages |

---

## 9. Logging & Audit Trail

| Event | Logged Data | Retention |
|-------|------------|-----------|
| Login attempts | IP, user agent, success/failure | 90 days |
| Content moderation | Entity, action, confidence, moderator | Indefinite |
| Role changes | Who changed, from/to role | Indefinite |
| Data exports | User, timestamp | 1 year |
| Account deletions | Anonymized record, timestamp | 1 year |
| Payment events | Transaction ID, amount, status | 7 years (tax) |
| Admin actions | Admin ID, action, target | Indefinite |

---

## 10. Incident Response

| Severity | Response Time | Action |
|----------|--------------|--------|
| Critical (data breach) | < 1 hour | Isolate, investigate, notify Israeli Privacy Authority within 72h |
| High (active attack) | < 4 hours | Rate limit, block IP ranges, enable maintenance mode |
| Medium (vulnerability found) | < 24 hours | Patch, test, deploy |
| Low (suspicious activity) | < 72 hours | Investigate, update monitoring |

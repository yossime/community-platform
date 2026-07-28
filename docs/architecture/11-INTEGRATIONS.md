# 11 — Integrations

> Stripe Connect, WhatsApp Business API, and Email (Resend/SES) integration details

---

## 1. Stripe Connect

### 1.1 Overview

Stripe Connect is used for three payment flows:

| Flow | Stripe Mode | Use Case |
|------|-------------|----------|
| **Marketplace escrow** | Separate charges + transfers | Freelancer payments with platform fee |
| **Subscriptions** | Stripe Checkout + Subscriptions | Membership tiers (Pro/Business) |
| **Course payments** | Direct charges + application fee | Course purchases |

### 1.2 Flow 1: Marketplace Escrow

```
Client posts project → Freelancer submits proposal → Client accepts
        │
        ▼
┌──────────────────────────────────────────────────┐
│  Milestone funding                                │
│                                                   │
│  1. Client clicks "Fund Milestone"                │
│  2. tRPC marketplace.fundMilestone                │
│  3. Stripe PaymentIntent.create                   │
│     - amount: milestone.amountAgorot              │
│     - capture_method: "manual"                    │
│     - transfer_data.destination: freelancer acct  │
│     - metadata: { milestoneId, projectId }        │
│  4. Client confirms payment (3D Secure if needed) │
│  5. Webhook: payment_intent.succeeded             │
│  6. Transaction.status → FUNDED → IN_ESCROW       │
└──────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────┐
│  Milestone delivery                               │
│                                                   │
│  1. Freelancer delivers work                      │
│  2. Client approves delivery                      │
│  3. tRPC marketplace.releaseMilestone             │
│  4. Stripe PaymentIntent.capture                  │
│  5. Stripe Transfer.create                        │
│     - amount: milestone - platformFee             │
│     - destination: freelancer Connect account     │
│  6. Transaction.status → RELEASED                 │
│  7. Platform fee: 10-15% (tier dependent)         │
│     - PROFESSIONAL: 15%                           │
│     - BUSINESS: 12%                               │
│     - ENTERPRISE: 10%                             │
└──────────────────────────────────────────────────┘
```

```typescript
// packages/payments/src/escrow.ts
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function fundMilestone(milestoneId: string, clientId: string) {
  const milestone = await db.milestone.findUniqueOrThrow({
    where: { id: milestoneId },
    include: {
      project: {
        include: { freelancer: { include: { freelancerProfile: true } } },
      },
    },
  });

  const freelancerStripeAccount =
    milestone.project.freelancer?.freelancerProfile?.stripeConnectAccountId;

  if (!freelancerStripeAccount) {
    throw new Error("Freelancer has not completed Stripe onboarding");
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: milestone.amountAgorot,
    currency: "ils",
    capture_method: "manual", // Authorize now, capture later
    transfer_data: {
      destination: freelancerStripeAccount,
    },
    metadata: {
      milestoneId,
      projectId: milestone.projectId,
      clientId,
      freelancerId: milestone.freelancerId!,
    },
  });

  await db.transaction.create({
    data: {
      milestoneId,
      payerId: clientId,
      payeeId: milestone.freelancerId!,
      amountAgorot: milestone.amountAgorot,
      platformFeeAgorot: calculatePlatformFee(milestone.amountAgorot, milestone.project.freelancer!),
      status: "PENDING_FUNDING",
      stripePaymentIntentId: paymentIntent.id,
    },
  });

  return { clientSecret: paymentIntent.client_secret };
}

export async function releaseMilestone(milestoneId: string, clientId: string) {
  const transaction = await db.transaction.findFirstOrThrow({
    where: { milestoneId, payerId: clientId, status: "IN_ESCROW" },
  });

  // Capture the held payment
  await stripe.paymentIntents.capture(transaction.stripePaymentIntentId!, {
    amount_to_capture: transaction.amountAgorot,
  });

  // Create transfer to freelancer (minus platform fee)
  const transferAmount = transaction.amountAgorot - transaction.platformFeeAgorot;
  const transfer = await stripe.transfers.create({
    amount: transferAmount,
    currency: "ils",
    destination: /* freelancer Connect account */,
    transfer_group: `project_${transaction.milestoneId}`,
  });

  await db.transaction.update({
    where: { id: transaction.id },
    data: {
      status: "RELEASED",
      stripeTransferId: transfer.id,
    },
  });
}

function calculatePlatformFee(amountAgorot: number, freelancer: any): number {
  const tier = freelancer.membership?.tier ?? "PROFESSIONAL";
  const feeRates: Record<string, number> = {
    PROFESSIONAL: 0.15,
    BUSINESS: 0.12,
    ENTERPRISE: 0.10,
  };
  return Math.round(amountAgorot * (feeRates[tier] ?? 0.15));
}
```

### 1.3 Flow 2: Subscriptions

```typescript
// packages/payments/src/subscriptions.ts

const STRIPE_PRICES: Record<string, string> = {
  PROFESSIONAL_MONTHLY: "price_professional_monthly",  // ₪49/mo
  PROFESSIONAL_YEARLY: "price_professional_yearly",    // ₪470/yr (20% off)
  BUSINESS_MONTHLY: "price_business_monthly",          // ₪99/mo
  BUSINESS_YEARLY: "price_business_yearly",            // ₪950/yr (20% off)
};

export async function createSubscriptionCheckout(
  userId: string,
  tier: "PROFESSIONAL" | "BUSINESS",
  interval: "MONTHLY" | "YEARLY",
) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { membership: true },
  });

  // Get or create Stripe customer
  let customerId = user.membership.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await db.membership.update({
      where: { userId },
      data: { stripeCustomerId: customerId },
    });
  }

  const priceKey = `${tier}_${interval}`;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: STRIPE_PRICES[priceKey], quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/membership?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/membership?canceled=true`,
    metadata: { userId, tier },
    locale: "he",
    payment_method_types: ["card"],
    allow_promotion_codes: true,
  });

  return { checkoutUrl: session.url };
}
```

### 1.4 Flow 3: Course Payments

```typescript
// packages/payments/src/course-payments.ts

export async function purchaseCourse(userId: string, courseId: string) {
  const course = await db.course.findUniqueOrThrow({
    where: { id: courseId },
    include: { instructor: { include: { freelancerProfile: true } } },
  });

  if (course.isFree) {
    // Direct enrollment, no payment
    return createEnrollment(userId, courseId);
  }

  const instructorAccount =
    course.instructor.freelancerProfile?.stripeConnectAccountId;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "ils",
        product: course.stripeProductId!,
        unit_amount: course.priceAgorot,
      },
      quantity: 1,
    }],
    payment_intent_data: instructorAccount ? {
      application_fee_amount: Math.round(course.priceAgorot * 0.15), // 15% platform fee
      transfer_data: { destination: instructorAccount },
    } : undefined,
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/courses/${course.slug}/learn`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/courses/${course.slug}`,
    metadata: { userId, courseId },
    locale: "he",
  });

  return { checkoutUrl: session.url };
}
```

### 1.5 Webhook Handler

```typescript
// packages/payments/src/webhooks.ts

const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "account.updated",                // Connect account status
  "transfer.created",
  "charge.dispute.created",
] as const;

export async function handleStripeWebhook(
  body: string,
  signature: string,
) {
  const event = stripe.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!,
  );

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription") {
        await handleSubscriptionCheckout(session);
      } else if (session.metadata?.courseId) {
        await handleCourseCheckout(session);
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await updateMembershipFromSubscription(subscription);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionCanceled(subscription);
      break;
    }

    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      if (paymentIntent.metadata?.milestoneId) {
        await handleMilestonePaymentSuccess(paymentIntent);
      }
      break;
    }

    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      await handleDispute(dispute);
      break;
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await handleConnectAccountUpdate(account);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}
```

### 1.6 Stripe Connect Onboarding

```typescript
// packages/payments/src/escrow.ts

export async function createConnectAccount(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  const account = await stripe.accounts.create({
    type: "express",
    country: "IL",
    email: user.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { userId },
  });

  await db.freelancerProfile.update({
    where: { userId },
    data: { stripeConnectAccountId: account.id },
  });

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/marketplace/dashboard?stripe=refresh`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/marketplace/dashboard?stripe=complete`,
    type: "account_onboarding",
  });

  return { onboardingUrl: accountLink.url };
}
```

---

## 2. WhatsApp Business API

### 2.1 Setup

| Property | Value |
|----------|-------|
| API | WhatsApp Cloud API v21+ |
| Provider | Meta Business Suite (direct) |
| Phone number | Dedicated business number |
| Rate limit | 500 messages/second |
| Template messages | Pre-approved by Meta (Hebrew) |

### 2.2 Message Templates (7 total)

| Template Name | Language | Purpose | Variables |
|---------------|----------|---------|-----------|
| `phone_verification` | he | OTP during registration | `{{1}}` = OTP code |
| `new_message_notification` | he | New direct message | `{{1}}` = sender name |
| `proposal_received` | he | New marketplace proposal | `{{1}}` = project title, `{{2}}` = freelancer name |
| `milestone_funded` | he | Payment deposited to escrow | `{{1}}` = amount, `{{2}}` = project title |
| `milestone_released` | he | Payment released to freelancer | `{{1}}` = amount, `{{2}}` = project title |
| `listing_expiring` | he | Classified about to expire | `{{1}}` = listing title, `{{2}}` = days remaining |
| `weekly_digest` | he | Weekly activity summary | `{{1}}` = notification count |

### 2.3 Template Examples

```
// phone_verification (he)
שלום! קוד האימות שלך הוא: {{1}}
הקוד תקף ל-5 דקות. אל תשתף אותו עם אף אחד.

// proposal_received (he)
הצעה חדשה התקבלה לפרויקט "{{1}}" מאת {{2}}.
צפה בהצעה: {{3}}

// milestone_funded (he)
תשלום בסך ₪{{1}} הופקד בנאמנות עבור "{{2}}".
כעת ניתן להתחיל בעבודה.
```

### 2.4 WhatsApp Client

```typescript
// packages/whatsapp/src/client.ts

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

interface WhatsAppClient {
  sendTemplate(to: string, template: string, params: string[]): Promise<void>;
  sendText(to: string, text: string): Promise<void>;
}

export function createWhatsAppClient(): WhatsAppClient {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!;

  return {
    async sendTemplate(to, template, params) {
      await fetch(
        `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: to.replace(/[^0-9+]/g, ""),
            type: "template",
            template: {
              name: template,
              language: { code: "he" },
              components: [{
                type: "body",
                parameters: params.map((p) => ({
                  type: "text",
                  text: p,
                })),
              }],
            },
          }),
        }
      );
    },

    async sendText(to, text) {
      await fetch(
        `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: to.replace(/[^0-9+]/g, ""),
            type: "text",
            text: { body: text },
          }),
        }
      );
    },
  };
}
```

### 2.5 Webhook Handler

```typescript
// packages/whatsapp/src/webhooks.ts

export async function handleWhatsAppWebhook(body: any) {
  const entries = body.entry ?? [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      for (const message of change.value.messages ?? []) {
        switch (message.type) {
          case "text":
            await handleIncomingText(message);
            break;
          case "interactive":
            await handleInteractiveResponse(message);
            break;
        }
      }

      // Status updates (delivered, read)
      for (const status of change.value.statuses ?? []) {
        await handleStatusUpdate(status);
      }
    }
  }
}

// Webhook verification (GET request from Meta)
export function verifyWebhook(mode: string, token: string, challenge: string) {
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return challenge;
  }
  throw new Error("Verification failed");
}
```

### 2.6 Rate Limiting

```typescript
// WhatsApp messages are rate-limited via Redis to stay under 500 msg/sec
import { redis } from "@platform/cache";

export async function canSendWhatsApp(): Promise<boolean> {
  const key = "whatsapp:rate:second";
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 1);
  return count <= 400; // Leave buffer below 500 limit
}
```

---

## 3. Email (Resend / AWS SES)

### 3.1 Architecture

| Aspect | Configuration |
|--------|-------------|
| Provider | Resend (primary) / AWS SES (fallback) |
| Template engine | React Email |
| Language | Hebrew (RTL) |
| Subdomains | `mail.platform.co.il` (transactional), `news.platform.co.il` (marketing) |
| No external images | All images inlined or hosted on platform domain |

### 3.2 Email Templates (12 types)

| Template | Trigger | Subject (Hebrew) |
|----------|---------|-------------------|
| `welcome` | Registration | ברוכים הבאים לפלטפורמה! |
| `verify-email` | Email verification | אמת את כתובת המייל שלך |
| `password-reset` | Password reset request | איפוס סיסמה |
| `new-message` | New DM received | הודעה חדשה מ-{senderName} |
| `thread-reply` | Reply to subscribed thread | תגובה חדשה ב-"{threadTitle}" |
| `proposal-received` | New marketplace proposal | הצעה חדשה לפרויקט "{projectTitle}" |
| `milestone-funded` | Escrow funded | תשלום ₪{amount} הופקד בנאמנות |
| `milestone-released` | Payment released | תשלום ₪{amount} שוחרר! |
| `course-enrolled` | Course enrollment | נרשמת לקורס "{courseTitle}" |
| `weekly-digest` | Weekly cron | סיכום שבועי: {count} עדכונים |
| `listing-expiring` | 3 days before expiry | המודעה "{title}" עומדת לפוג |
| `moderation-action` | Content moderated | עדכון לגבי התוכן שפרסמת |

### 3.3 React Email Template Example

```tsx
// packages/email/src/templates/thread-reply.tsx
import {
  Html, Head, Body, Container, Section, Text, Button, Hr,
  Heading, Preview,
} from "@react-email/components";

interface ThreadReplyEmailProps {
  recipientName: string;
  threadTitle: string;
  replyAuthor: string;
  replyExcerpt: string;
  threadUrl: string;
}

export function ThreadReplyEmail({
  recipientName,
  threadTitle,
  replyAuthor,
  replyExcerpt,
  threadUrl,
}: ThreadReplyEmailProps) {
  return (
    <Html lang="he" dir="rtl">
      <Head />
      <Preview>תגובה חדשה מ-{replyAuthor}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>תגובה חדשה</Heading>

          <Text style={textStyle}>
            שלום {recipientName},
          </Text>

          <Text style={textStyle}>
            <strong>{replyAuthor}</strong> הגיב/ה בנושא: <strong>"{threadTitle}"</strong>
          </Text>

          <Section style={quoteStyle}>
            <Text style={textStyle}>{replyExcerpt}</Text>
          </Section>

          <Button href={threadUrl} style={buttonStyle}>
            צפה בתגובה
          </Button>

          <Hr />

          <Text style={footerStyle}>
            קיבלת מייל זה כי אתה רשום לעדכונים בנושא זה.
            <br />
            ניתן לבטל רישום בהגדרות החשבון.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = {
  fontFamily: "'Heebo', 'Rubik', Arial, sans-serif",
  direction: "rtl" as const,
  textAlign: "right" as const,
  backgroundColor: "#f4f4f5",
  padding: "20px",
};

const containerStyle = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  padding: "32px",
};

const headingStyle = { fontSize: "24px", fontWeight: "700", marginBottom: "16px" };
const textStyle = { fontSize: "16px", lineHeight: "1.6", color: "#18181b" };
const quoteStyle = {
  borderRight: "4px solid #3b82f6",
  paddingRight: "16px",
  margin: "16px 0",
  backgroundColor: "#f8fafc",
  borderRadius: "4px",
  padding: "12px 16px",
};
const buttonStyle = {
  backgroundColor: "#3b82f6",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  textDecoration: "none",
  fontWeight: "600",
};
const footerStyle = { fontSize: "12px", color: "#71717a", marginTop: "24px" };
```

### 3.4 Email Sender

```typescript
// packages/email/src/sender.ts
import { Resend } from "resend";
import { render } from "@react-email/render";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendEmailOptions {
  to: string;
  subject: string;
  template: React.ReactElement;
  isMarketing?: boolean;
}

export async function sendEmail({ to, subject, template, isMarketing }: SendEmailOptions) {
  const html = await render(template);

  await resend.emails.send({
    from: isMarketing
      ? "פלטפורמה <digest@news.platform.co.il>"
      : "פלטפורמה <noreply@mail.platform.co.il>",
    to,
    subject,
    html,
    headers: {
      "List-Unsubscribe": `<${process.env.NEXT_PUBLIC_APP_URL}/settings/notifications>`,
    },
  });
}
```

### 3.5 Notification Worker

```typescript
// workers/notification-worker/src/handler.ts

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const notification = JSON.parse(record.body);
    const { type, userId, data, channels } = notification;

    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      include: { settings: true },
    });

    // Create in-app notification
    if (channels.includes("IN_APP")) {
      await db.notification.create({
        data: {
          userId,
          type,
          title: getNotificationTitle(type, data),
          body: getNotificationBody(type, data),
          data,
          channels,
          actionUrl: getActionUrl(type, data),
        },
      });
    }

    // Send email if user has email notifications enabled
    if (channels.includes("EMAIL") && user.settings?.emailNotifications) {
      await sendNotificationEmail(user, type, data);
    }

    // Send WhatsApp if user opted in
    if (channels.includes("WHATSAPP") && user.settings?.whatsappNotifications && user.phone) {
      if (await canSendWhatsApp()) {
        await sendWhatsAppNotification(user.phone, type, data);
      }
    }

    // Web push
    if (channels.includes("PUSH") && user.settings?.pushNotifications) {
      await sendPushNotification(userId, type, data);
    }
  }
};
```

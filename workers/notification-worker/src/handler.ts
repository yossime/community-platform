import type { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda';
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import { z } from 'zod';

import {
  notificationPayloadSchema,
  EVENT_TO_DB_TYPE,
  type NotificationPayload,
} from './types';
import { getTemplate, getWhatsAppTemplate } from './templates';

// ─── Environment Validation ─────────────────────────

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  FROM_EMAIL: z.string().email().default('noreply@platform.co.il'),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }
  return cachedEnv;
}

// ─── Singleton Clients ──────────────────────────────

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(getEnv().RESEND_API_KEY);
  }
  return resendClient;
}

// ─── WhatsApp API ───────────────────────────────────

const GRAPH_API_URL = 'https://graph.facebook.com/v18.0';

interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
}

function getWhatsAppConfig(): WhatsAppConfig | null {
  const env = getEnv();
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return null;
  }
  return {
    token: env.WHATSAPP_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
  };
}

async function sendWhatsAppTemplateMessage(
  to: string,
  templateName: string,
  parameters: string[],
): Promise<void> {
  const config = getWhatsAppConfig();
  if (!config) {
    console.warn('[notification-worker] WhatsApp not configured, skipping WhatsApp delivery');
    return;
  }

  const response = await fetch(
    `${GRAPH_API_URL}/${config.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'he' },
          components: [
            {
              type: 'body',
              parameters: parameters.map((p) => ({ type: 'text', text: p })),
            },
          ],
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp API error (${response.status}): ${errorText}`);
  }
}

// ─── Lambda Handler ─────────────────────────────────

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  const results = await Promise.allSettled(
    event.Records.map(async (record) => {
      const messageId = record.messageId;

      try {
        const rawBody: unknown = JSON.parse(record.body);
        const payload = notificationPayloadSchema.parse(rawBody);

        await processNotification(payload);
      } catch (error) {
        console.error(
          `[notification-worker] Failed to process message ${messageId}:`,
          error,
        );
        batchItemFailures.push({ itemIdentifier: messageId });
      }
    }),
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = batchItemFailures.length;
  console.log(
    `[notification-worker] Batch complete: ${succeeded} succeeded, ${failed} failed out of ${event.Records.length} records`,
  );

  return { batchItemFailures };
}

// ─── Notification Dispatcher ────────────────────────

async function processNotification(payload: NotificationPayload): Promise<void> {
  const { userId, type } = payload;

  console.log(`[notification-worker] Processing ${type} notification for user ${userId}`);

  // Fetch user with relevant fields for channel delivery
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      displayName: true,
      status: true,
    },
  });

  if (!user) {
    console.warn(`[notification-worker] User ${userId} not found, skipping notification`);
    return;
  }

  if (user.status !== 'ACTIVE') {
    console.warn(
      `[notification-worker] User ${userId} status is ${user.status}, skipping notification`,
    );
    return;
  }

  // Generate template content
  const template = getTemplate(payload);

  // Determine channels to deliver
  const channels = determineChannels(payload, user);

  // Track delivery timestamps for the DB record
  let emailSentAt: Date | undefined;
  let whatsappSentAt: Date | undefined;

  // Execute deliveries concurrently
  const deliveryResults = await Promise.allSettled([
    // Email delivery
    channels.email
      ? sendEmailNotification(user.email, template.subject, template.body, template.link)
          .then(() => {
            emailSentAt = new Date();
            console.log(`[notification-worker] Email sent for ${type} to ${user.email}`);
          })
      : Promise.resolve(),

    // WhatsApp delivery
    channels.whatsapp && user.phone
      ? deliverWhatsApp(payload, user.phone)
          .then(() => {
            whatsappSentAt = new Date();
            console.log(`[notification-worker] WhatsApp sent for ${type} to ${user.phone}`);
          })
      : Promise.resolve(),
  ]);

  // Log any channel delivery failures (but don't fail the overall notification)
  for (const result of deliveryResults) {
    if (result.status === 'rejected') {
      console.error(
        `[notification-worker] Channel delivery failed for ${type}:`,
        result.reason,
      );
    }
  }

  // Always create in-app notification record
  if (channels.inApp) {
    await createInAppNotification(payload, template, emailSentAt, whatsappSentAt);
    console.log(`[notification-worker] In-app notification created for ${type}, user ${userId}`);
  }
}

// ─── Channel Determination ──────────────────────────

interface ChannelFlags {
  email: boolean;
  whatsapp: boolean;
  inApp: boolean;
}

/**
 * Determines which channels to use for a notification.
 *
 * Since the schema has no NotificationPreference model, we use
 * sensible defaults based on notification type and available user data.
 *
 * When a NotificationPreference model is added to the schema, this
 * function should be updated to query user preferences from the DB.
 */
function determineChannels(
  payload: NotificationPayload,
  user: { email: string; phone: string | null },
): ChannelFlags {
  const hasPhone = !!user.phone;

  switch (payload.type) {
    // High-priority financial notifications: all channels
    case 'payment_received':
    case 'payment_released':
      return { email: true, whatsapp: hasPhone, inApp: true };

    // Important project updates: email + in-app, WhatsApp if available
    case 'new_proposal':
    case 'milestone_completed':
      return { email: true, whatsapp: hasPhone, inApp: true };

    // Engagement notifications: email + in-app
    case 'new_reply':
    case 'course_enrolled':
      return { email: true, whatsapp: false, inApp: true };

    // Moderation: in-app only (sensitive content)
    case 'moderation_result':
      return { email: false, whatsapp: false, inApp: true };

    // Digest: email + WhatsApp (no in-app to avoid clutter)
    case 'weekly_digest':
      return { email: true, whatsapp: hasPhone, inApp: false };

    // Welcome: all channels
    case 'welcome':
      return { email: true, whatsapp: hasPhone, inApp: true };
  }
}

// ─── Email Delivery ─────────────────────────────────

async function sendEmailNotification(
  to: string,
  subject: string,
  body: string,
  actionUrl: string,
): Promise<void> {
  const env = getEnv();
  const resend = getResend();

  const { error } = await resend.emails.send({
    from: `קהילת אנשי מקצוע <${env.FROM_EMAIL}>`,
    to: [to],
    subject,
    html: buildEmailHtml(subject, body, actionUrl),
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }
}

/**
 * Builds a simple, Netfree-compatible HTML email.
 * No external resources, no images, inline styles only.
 * RTL direction for Hebrew content.
 */
function buildEmailHtml(subject: string, body: string, actionUrl: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Heebo,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <tr>
            <td style="background-color:#1e3a5f;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">קהילת אנשי מקצוע</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px 0;color:#1a1a1a;font-size:18px;font-weight:600;">${escapeHtml(subject)}</h2>
              <p style="margin:0 0 24px 0;color:#4a4a4a;font-size:16px;line-height:1.6;">${escapeHtml(body)}</p>
              <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background-color:#1e3a5f;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">צפה בפרטים</a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e5e5e5;">
              <p style="margin:0;color:#999999;font-size:12px;text-align:center;">הודעה זו נשלחה מקהילת אנשי מקצוע. ניתן לנהל את העדפות ההתראות בהגדרות החשבון.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Escapes HTML special characters to prevent XSS in email templates.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── WhatsApp Delivery ──────────────────────────────

async function deliverWhatsApp(
  payload: NotificationPayload,
  phone: string,
): Promise<void> {
  const whatsappTemplate = getWhatsAppTemplate(payload);

  if (!whatsappTemplate) {
    // This notification type doesn't have a WhatsApp template
    return;
  }

  await sendWhatsAppTemplateMessage(
    phone,
    whatsappTemplate.templateName,
    whatsappTemplate.parameters,
  );
}

// ─── In-App Notification ────────────────────────────

async function createInAppNotification(
  payload: NotificationPayload,
  template: { subject: string; body: string; link: string },
  emailSentAt?: Date,
  whatsappSentAt?: Date,
): Promise<void> {
  const dbType = EVENT_TO_DB_TYPE[payload.type];

  // Build the channels array based on what was actually sent
  const channels: string[] = ['IN_APP'];
  if (emailSentAt) channels.push('EMAIL');
  if (whatsappSentAt) channels.push('WHATSAPP');

  await prisma.notification.create({
    data: {
      userId: payload.userId,
      type: dbType as Parameters<typeof prisma.notification.create>[0]['data']['type'],
      title: template.subject,
      body: template.body,
      actionUrl: template.link,
      channels: channels as Parameters<typeof prisma.notification.create>[0]['data']['channels'],
      data: (payload.data ?? undefined) as Parameters<typeof prisma.notification.create>[0]['data']['data'],
      emailSentAt: emailSentAt ?? null,
      whatsappSentAt: whatsappSentAt ?? null,
    },
  });
}

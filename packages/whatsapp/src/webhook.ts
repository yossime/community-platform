import { z } from 'zod';

// ─── Webhook Payload Types ─────────────────────────────

const webhookEntrySchema = z.object({
  id: z.string(),
  changes: z.array(
    z.object({
      value: z.object({
        messaging_product: z.literal('whatsapp'),
        metadata: z.object({
          display_phone_number: z.string(),
          phone_number_id: z.string(),
        }),
        contacts: z
          .array(
            z.object({
              profile: z.object({ name: z.string() }),
              wa_id: z.string(),
            }),
          )
          .optional(),
        messages: z
          .array(
            z.object({
              from: z.string(),
              id: z.string(),
              timestamp: z.string(),
              type: z.string(),
              text: z.object({ body: z.string() }).optional(),
            }),
          )
          .optional(),
        statuses: z
          .array(
            z.object({
              id: z.string(),
              status: z.enum(['sent', 'delivered', 'read', 'failed']),
              timestamp: z.string(),
              recipient_id: z.string(),
            }),
          )
          .optional(),
      }),
      field: z.literal('messages'),
    }),
  ),
});

const webhookPayloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(webhookEntrySchema),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
export type WebhookMessage = NonNullable<
  WebhookPayload['entry'][0]['changes'][0]['value']['messages']
>[0];
export type WebhookStatus = NonNullable<
  WebhookPayload['entry'][0]['changes'][0]['value']['statuses']
>[0];

// ─── Webhook Verification ──────────────────────────────

export function verifyWebhook(
  mode: string | null,
  token: string | null,
  challenge: string | null,
): string | null {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return challenge;
  }
  return null;
}

// ─── Process Webhook ───────────────────────────────────

export interface WebhookHandlers {
  onMessage?: (message: WebhookMessage, senderPhone: string, senderName: string) => Promise<void>;
  onStatusUpdate?: (status: WebhookStatus) => Promise<void>;
}

export async function processWebhook(body: unknown, handlers: WebhookHandlers) {
  const parsed = webhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    console.error('Invalid WhatsApp webhook payload:', parsed.error);
    return;
  }

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const { messages, statuses, contacts } = change.value;

      // Handle incoming messages
      if (messages && handlers.onMessage) {
        for (const message of messages) {
          const contact = contacts?.find((c) => c.wa_id === message.from);
          const senderName = contact?.profile.name ?? message.from;
          await handlers.onMessage(message, message.from, senderName);
        }
      }

      // Handle status updates
      if (statuses && handlers.onStatusUpdate) {
        for (const status of statuses) {
          await handlers.onStatusUpdate(status);
        }
      }
    }
  }
}

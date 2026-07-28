import { describe, it, expect, vi, beforeEach } from 'vitest';

import { verifyWebhook, processWebhook, type WebhookHandlers } from './webhook';

describe('WhatsApp Webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify-token';
  });

  describe('verifyWebhook', () => {
    it('returns challenge when token matches', () => {
      const result = verifyWebhook('subscribe', 'test-verify-token', 'challenge-123');
      expect(result).toBe('challenge-123');
    });

    it('returns null when mode is not subscribe', () => {
      const result = verifyWebhook('unsubscribe', 'test-verify-token', 'challenge-123');
      expect(result).toBeNull();
    });

    it('returns null when token does not match', () => {
      const result = verifyWebhook('subscribe', 'wrong-token', 'challenge-123');
      expect(result).toBeNull();
    });

    it('returns null when challenge is missing', () => {
      const result = verifyWebhook('subscribe', 'test-verify-token', null);
      expect(result).toBeNull();
    });

    it('returns null when all params are null', () => {
      const result = verifyWebhook(null, null, null);
      expect(result).toBeNull();
    });
  });

  describe('processWebhook', () => {
    const validPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'entry-1',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+972501234567',
                  phone_number_id: 'phone-1',
                },
                contacts: [
                  { profile: { name: 'Test User' }, wa_id: '972501234567' },
                ],
                messages: [
                  {
                    from: '972501234567',
                    id: 'msg-1',
                    timestamp: '1234567890',
                    type: 'text',
                    text: { body: 'Hello!' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    it('processes incoming messages', async () => {
      const handlers: WebhookHandlers = {
        onMessage: vi.fn(),
      };

      await processWebhook(validPayload, handlers);

      expect(handlers.onMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'msg-1', from: '972501234567' }),
        '972501234567',
        'Test User',
      );
    });

    it('processes status updates', async () => {
      const statusPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'entry-1',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+972501234567',
                    phone_number_id: 'phone-1',
                  },
                  statuses: [
                    {
                      id: 'msg-1',
                      status: 'delivered',
                      timestamp: '1234567890',
                      recipient_id: '972501234567',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const handlers: WebhookHandlers = {
        onStatusUpdate: vi.fn(),
      };

      await processWebhook(statusPayload, handlers);

      expect(handlers.onStatusUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'msg-1', status: 'delivered' }),
      );
    });

    it('silently ignores invalid payloads', async () => {
      const handlers: WebhookHandlers = {
        onMessage: vi.fn(),
      };

      await processWebhook({ invalid: 'data' }, handlers);

      expect(handlers.onMessage).not.toHaveBeenCalled();
    });

    it('handles payload without messages or statuses', async () => {
      const emptyPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'entry-1',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+972501234567',
                    phone_number_id: 'phone-1',
                  },
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const handlers: WebhookHandlers = {
        onMessage: vi.fn(),
        onStatusUpdate: vi.fn(),
      };

      await processWebhook(emptyPayload, handlers);

      expect(handlers.onMessage).not.toHaveBeenCalled();
      expect(handlers.onStatusUpdate).not.toHaveBeenCalled();
    });

    it('uses phone number as sender name when contact not found', async () => {
      const payloadNoContact = {
        ...validPayload,
        entry: [
          {
            ...validPayload.entry[0]!,
            changes: [
              {
                ...validPayload.entry[0]!.changes[0]!,
                value: {
                  ...validPayload.entry[0]!.changes[0]!.value,
                  contacts: undefined,
                },
              },
            ],
          },
        ],
      };

      const handlers: WebhookHandlers = {
        onMessage: vi.fn(),
      };

      await processWebhook(payloadNoContact, handlers);

      expect(handlers.onMessage).toHaveBeenCalledWith(
        expect.anything(),
        '972501234567',
        '972501234567', // fallback to phone number
      );
    });
  });
});

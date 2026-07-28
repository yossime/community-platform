import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

vi.mock('./stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}));

import { handleWebhookEvent, type WebhookHandlers } from './webhooks';

describe('Payment Webhooks', () => {
  let handlers: WebhookHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = {
      onPaymentIntentSucceeded: vi.fn(),
      onPaymentIntentFailed: vi.fn(),
      onPaymentIntentCanceled: vi.fn(),
      onSubscriptionCreated: vi.fn(),
      onSubscriptionUpdated: vi.fn(),
      onSubscriptionDeleted: vi.fn(),
      onInvoicePaid: vi.fn(),
      onInvoicePaymentFailed: vi.fn(),
      onAccountUpdated: vi.fn(),
      onTransferCompleted: vi.fn(),
    };
  });

  function createEvent(type: string, data: Record<string, unknown> = {}): Stripe.Event {
    return {
      id: 'evt_test',
      type,
      data: { object: data },
    } as unknown as Stripe.Event;
  }

  describe('handleWebhookEvent', () => {
    it('routes payment_intent.succeeded correctly', async () => {
      const event = createEvent('payment_intent.succeeded', { id: 'pi_1', amount: 5000 });
      await handleWebhookEvent(event, handlers);

      expect(handlers.onPaymentIntentSucceeded).toHaveBeenCalledWith({ id: 'pi_1', amount: 5000 });
      expect(handlers.onPaymentIntentFailed).not.toHaveBeenCalled();
    });

    it('routes payment_intent.payment_failed correctly', async () => {
      const event = createEvent('payment_intent.payment_failed', { id: 'pi_2' });
      await handleWebhookEvent(event, handlers);

      expect(handlers.onPaymentIntentFailed).toHaveBeenCalled();
      expect(handlers.onPaymentIntentSucceeded).not.toHaveBeenCalled();
    });

    it('routes payment_intent.canceled correctly', async () => {
      const event = createEvent('payment_intent.canceled', { id: 'pi_3' });
      await handleWebhookEvent(event, handlers);

      expect(handlers.onPaymentIntentCanceled).toHaveBeenCalled();
    });

    it('routes customer.subscription.created correctly', async () => {
      const event = createEvent('customer.subscription.created', { id: 'sub_1' });
      await handleWebhookEvent(event, handlers);

      expect(handlers.onSubscriptionCreated).toHaveBeenCalledWith({ id: 'sub_1' });
    });

    it('routes customer.subscription.updated correctly', async () => {
      const event = createEvent('customer.subscription.updated', { id: 'sub_1' });
      await handleWebhookEvent(event, handlers);

      expect(handlers.onSubscriptionUpdated).toHaveBeenCalled();
    });

    it('routes customer.subscription.deleted correctly', async () => {
      const event = createEvent('customer.subscription.deleted', { id: 'sub_1' });
      await handleWebhookEvent(event, handlers);

      expect(handlers.onSubscriptionDeleted).toHaveBeenCalled();
    });

    it('routes invoice.paid correctly', async () => {
      const event = createEvent('invoice.paid', { id: 'inv_1' });
      await handleWebhookEvent(event, handlers);

      expect(handlers.onInvoicePaid).toHaveBeenCalled();
    });

    it('routes invoice.payment_failed correctly', async () => {
      const event = createEvent('invoice.payment_failed', { id: 'inv_2' });
      await handleWebhookEvent(event, handlers);

      expect(handlers.onInvoicePaymentFailed).toHaveBeenCalled();
    });

    it('routes account.updated correctly', async () => {
      const event = createEvent('account.updated', { id: 'acct_1' });
      await handleWebhookEvent(event, handlers);

      expect(handlers.onAccountUpdated).toHaveBeenCalled();
    });

    it('routes transfer.created correctly', async () => {
      const event = createEvent('transfer.created', { id: 'tr_1' });
      await handleWebhookEvent(event, handlers);

      expect(handlers.onTransferCompleted).toHaveBeenCalled();
    });

    it('handles unknown event types gracefully', async () => {
      const event = createEvent('unknown.event.type', {});
      await handleWebhookEvent(event, handlers);

      // No handler should have been called
      for (const handler of Object.values(handlers)) {
        expect(handler).not.toHaveBeenCalled();
      }
    });

    it('handles missing optional handlers', async () => {
      const event = createEvent('payment_intent.succeeded', { id: 'pi_1' });
      // Pass empty handlers - should not throw
      await expect(handleWebhookEvent(event, {})).resolves.toBeUndefined();
    });
  });
});

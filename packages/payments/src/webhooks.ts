import type Stripe from 'stripe';

import { stripe } from './stripe';

export function constructWebhookEvent(body: string, signature: string): Stripe.Event {
  return stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
}

export type WebhookHandler = (event: Stripe.Event) => Promise<void>;

export interface WebhookHandlers {
  onPaymentIntentSucceeded?: (paymentIntent: Stripe.PaymentIntent) => Promise<void>;
  onPaymentIntentFailed?: (paymentIntent: Stripe.PaymentIntent) => Promise<void>;
  onPaymentIntentCanceled?: (paymentIntent: Stripe.PaymentIntent) => Promise<void>;
  onSubscriptionCreated?: (subscription: Stripe.Subscription) => Promise<void>;
  onSubscriptionUpdated?: (subscription: Stripe.Subscription) => Promise<void>;
  onSubscriptionDeleted?: (subscription: Stripe.Subscription) => Promise<void>;
  onInvoicePaid?: (invoice: Stripe.Invoice) => Promise<void>;
  onInvoicePaymentFailed?: (invoice: Stripe.Invoice) => Promise<void>;
  onAccountUpdated?: (account: Stripe.Account) => Promise<void>;
  onTransferCompleted?: (transfer: Stripe.Transfer) => Promise<void>;
}

export async function handleWebhookEvent(
  event: Stripe.Event,
  handlers: WebhookHandlers,
): Promise<void> {
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlers.onPaymentIntentSucceeded?.(event.data.object as Stripe.PaymentIntent);
      break;
    case 'payment_intent.payment_failed':
      await handlers.onPaymentIntentFailed?.(event.data.object as Stripe.PaymentIntent);
      break;
    case 'payment_intent.canceled':
      await handlers.onPaymentIntentCanceled?.(event.data.object as Stripe.PaymentIntent);
      break;
    case 'customer.subscription.created':
      await handlers.onSubscriptionCreated?.(event.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.updated':
      await handlers.onSubscriptionUpdated?.(event.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.deleted':
      await handlers.onSubscriptionDeleted?.(event.data.object as Stripe.Subscription);
      break;
    case 'invoice.paid':
      await handlers.onInvoicePaid?.(event.data.object as Stripe.Invoice);
      break;
    case 'invoice.payment_failed':
      await handlers.onInvoicePaymentFailed?.(event.data.object as Stripe.Invoice);
      break;
    case 'account.updated':
      await handlers.onAccountUpdated?.(event.data.object as Stripe.Account);
      break;
    case 'transfer.created':
      await handlers.onTransferCompleted?.(event.data.object as Stripe.Transfer);
      break;
  }
}

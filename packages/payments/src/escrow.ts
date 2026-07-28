import { stripe } from './stripe';
import { type CreatePaymentIntentInput, type EscrowResult } from './types';

export async function createEscrowPayment(input: CreatePaymentIntentInput): Promise<EscrowResult> {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: input.amountAgorot,
    currency: 'ils',
    metadata: {
      milestoneId: input.milestoneId,
      payerId: input.payerId,
      payeeId: input.payeeId,
      ...input.metadata,
    },
    capture_method: 'manual', // Hold funds without capturing
  });

  return {
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret!,
    status: paymentIntent.status,
  };
}

export async function captureEscrowPayment(paymentIntentId: string) {
  return stripe.paymentIntents.capture(paymentIntentId);
}

export async function refundEscrowPayment(paymentIntentId: string) {
  return stripe.refunds.create({
    payment_intent: paymentIntentId,
  });
}

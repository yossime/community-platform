export interface CreatePaymentIntentInput {
  amountAgorot: number;
  milestoneId: string;
  payerId: string;
  payeeId: string;
  metadata?: Record<string, string>;
}

export interface EscrowResult {
  paymentIntentId: string;
  clientSecret: string;
  status: string;
}

export interface SubscriptionInput {
  userId: string;
  stripeCustomerId: string;
  priceId: string;
}

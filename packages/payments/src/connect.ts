import { stripe } from './stripe';

/**
 * Create a Stripe Connect account for a freelancer.
 */
export async function createConnectAccount(userId: string, email: string) {
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'IL',
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { userId },
  });

  return account;
}

/**
 * Generate an onboarding link for a Connect account.
 */
export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
) {
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });

  return link;
}

/**
 * Get the login link for an existing Connect account dashboard.
 */
export async function createLoginLink(accountId: string) {
  return stripe.accounts.createLoginLink(accountId);
}

/**
 * Create a transfer to a Connect account (release escrow funds).
 */
export async function transferToFreelancer(
  amount: number,
  connectedAccountId: string,
  metadata: Record<string, string>,
) {
  return stripe.transfers.create({
    amount,
    currency: 'ils',
    destination: connectedAccountId,
    metadata,
  });
}

/**
 * Get Stripe Connect account details.
 */
export async function getConnectAccount(accountId: string) {
  return stripe.accounts.retrieve(accountId);
}

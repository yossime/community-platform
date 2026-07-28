import Stripe from 'stripe';

const globalForStripe = globalThis as unknown as {
  stripe: Stripe | undefined;
};

function createStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    // Return a proxy that throws at runtime but doesn't crash at build time
    return new Proxy({} as Stripe, {
      get: (_, prop) => {
        if (typeof prop === 'string') {
          return new Proxy(() => {}, {
            get: () => () => { throw new Error('Stripe not configured: missing STRIPE_SECRET_KEY'); },
            apply: () => { throw new Error('Stripe not configured: missing STRIPE_SECRET_KEY'); },
          });
        }
      },
    });
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
    typescript: true,
  });
}

export const stripe = globalForStripe.stripe ?? createStripeClient();

if (process.env.NODE_ENV !== 'production') globalForStripe.stripe = stripe;

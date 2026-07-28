import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { constructWebhookEvent, handleWebhookEvent } from '@platform/payments';
import { prisma } from '@platform/db';

export async function POST(request: NextRequest) {
  let body: string;
  try {
    body = await request.text();
  } catch (error) {
    console.error('[webhooks/stripe] Failed to read request body:', error);
    return NextResponse.json(
      { error: 'Failed to read request body' },
      { status: 400 }
    );
  }

  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[webhooks/stripe] STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(body, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[webhooks/stripe] Signature verification failed: ${message}`);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  try {
    await handleWebhookEvent(event, {
      // ─── Escrow Payments ────────────────────────────
      async onPaymentIntentSucceeded(paymentIntent) {
        const milestoneId = paymentIntent.metadata.milestoneId;
        if (!milestoneId) return;

        await prisma.$transaction([
          prisma.transaction.updateMany({
            where: { stripePaymentIntentId: paymentIntent.id },
            data: { status: 'FUNDED' },
          }),
          prisma.milestone.update({
            where: { id: milestoneId },
            data: { status: 'IN_PROGRESS' },
          }),
        ]);

        // Create notification for freelancer
        const milestone = await prisma.milestone.findUnique({
          where: { id: milestoneId },
          include: { project: true },
        });
        if (milestone?.freelancerId) {
          const freelancer = await prisma.freelancerProfile.findUnique({
            where: { id: milestone.freelancerId },
          });
          if (freelancer) {
            await prisma.notification.create({
              data: {
                userId: freelancer.userId,
                type: 'MILESTONE_FUNDED',
                title: 'אבן דרך מומנה',
                body: `האבן דרך "${milestone.title}" בפרויקט "${milestone.project.title}" מומנה`,
                channels: ['IN_APP'],
                actionUrl: `/marketplace/${milestone.project.slug}`,
              },
            });
          }
        }
      },

      async onPaymentIntentFailed(paymentIntent) {
        const milestoneId = paymentIntent.metadata.milestoneId;
        if (!milestoneId) return;

        await prisma.transaction.updateMany({
          where: { stripePaymentIntentId: paymentIntent.id },
          data: { status: 'PENDING_FUNDING' },
        });
      },

      // ─── Subscriptions ─────────────────────────────
      async onSubscriptionCreated(subscription) {
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;

        const membership = await prisma.membership.findFirst({
          where: { stripeCustomerId: customerId },
        });
        if (!membership) return;

        const priceId = subscription.items.data[0]?.price.id;
        const tier = mapPriceToTier(priceId);

        await prisma.membership.update({
          where: { id: membership.id },
          data: {
            stripeSubscriptionId: subscription.id,
            tier,
            status: 'ACTIVE',
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            ...getTierPermissions(tier),
          },
        });
      },

      async onSubscriptionUpdated(subscription) {
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;

        const membership = await prisma.membership.findFirst({
          where: { stripeCustomerId: customerId },
        });
        if (!membership) return;

        const statusMap: Record<string, string> = {
          active: 'ACTIVE',
          past_due: 'PAST_DUE',
          canceled: 'CANCELED',
          paused: 'PAUSED',
        };

        const priceId = subscription.items.data[0]?.price.id;
        const tier = mapPriceToTier(priceId);

        await prisma.membership.update({
          where: { id: membership.id },
          data: {
            tier,
            status: (statusMap[subscription.status] ?? 'ACTIVE') as 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'PAUSED',
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            ...getTierPermissions(tier),
          },
        });
      },

      async onSubscriptionDeleted(subscription) {
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;

        const membership = await prisma.membership.findFirst({
          where: { stripeCustomerId: customerId },
        });
        if (!membership) return;

        await prisma.membership.update({
          where: { id: membership.id },
          data: {
            tier: 'FREE',
            status: 'CANCELED',
            stripeSubscriptionId: null,
            ...getTierPermissions('FREE'),
          },
        });
      },

      async onInvoicePaid(invoice) {
        const customerId =
          typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (!customerId) return;

        const membership = await prisma.membership.findFirst({
          where: { stripeCustomerId: customerId },
        });
        if (!membership) return;

        await prisma.membership.update({
          where: { id: membership.id },
          data: { status: 'ACTIVE' },
        });
      },

      async onInvoicePaymentFailed(invoice) {
        const customerId =
          typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (!customerId) return;

        const membership = await prisma.membership.findFirst({
          where: { stripeCustomerId: customerId },
        });
        if (!membership) return;

        await prisma.membership.update({
          where: { id: membership.id },
          data: { status: 'PAST_DUE' },
        });

        // Notify user
        await prisma.notification.create({
          data: {
            userId: membership.userId,
            type: 'SYSTEM_ANNOUNCEMENT',
            title: 'בעיה בתשלום',
            body: 'התשלום עבור המנוי שלך נכשל. אנא עדכן את אמצעי התשלום.',
            channels: ['IN_APP', 'EMAIL'],
            actionUrl: '/settings',
          },
        });
      },

      // ─── Connect Accounts ──────────────────────────
      async onAccountUpdated(account) {
        if (account.charges_enabled && account.payouts_enabled) {
          await prisma.freelancerProfile.updateMany({
            where: { stripeConnectAccountId: account.id },
            data: { stripeConnectOnboarded: true },
          });
        }
      },
    });

    return NextResponse.json(
      { received: true },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[webhooks/stripe] Handler error: ${message}`);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

// ─── Helpers ──────────────────────────────────────────

function mapPriceToTier(priceId: string | undefined): 'FREE' | 'PROFESSIONAL' | 'BUSINESS' | 'ENTERPRISE' {
  const mapping: Record<string, 'PROFESSIONAL' | 'BUSINESS' | 'ENTERPRISE'> = {
    [process.env.STRIPE_PRICE_PROFESSIONAL ?? '']: 'PROFESSIONAL',
    [process.env.STRIPE_PRICE_BUSINESS ?? '']: 'BUSINESS',
    [process.env.STRIPE_PRICE_ENTERPRISE ?? '']: 'ENTERPRISE',
  };
  return (priceId && mapping[priceId]) || 'FREE';
}

function getTierPermissions(tier: string) {
  const perms = {
    FREE: {
      canAccessMarketplace: false,
      canAccessAllForums: false,
      hasAiTools: false,
      hasAnalytics: false,
      canCreateCourses: false,
      hasVerifiedBadge: false,
      maxPortfolioItems: 3,
      maxClassifieds: 2,
      maxDailyMessages: 5,
      maxStorageMb: 100,
    },
    PROFESSIONAL: {
      canAccessMarketplace: true,
      canAccessAllForums: true,
      hasAiTools: true,
      hasAnalytics: true,
      canCreateCourses: false,
      hasVerifiedBadge: true,
      maxPortfolioItems: 20,
      maxClassifieds: 10,
      maxDailyMessages: 50,
      maxStorageMb: 1000,
    },
    BUSINESS: {
      canAccessMarketplace: true,
      canAccessAllForums: true,
      hasAiTools: true,
      hasAnalytics: true,
      canCreateCourses: true,
      hasVerifiedBadge: true,
      maxPortfolioItems: 100,
      maxClassifieds: 50,
      maxDailyMessages: 200,
      maxStorageMb: 5000,
    },
    ENTERPRISE: {
      canAccessMarketplace: true,
      canAccessAllForums: true,
      hasAiTools: true,
      hasAnalytics: true,
      canCreateCourses: true,
      hasVerifiedBadge: true,
      maxPortfolioItems: 999,
      maxClassifieds: 999,
      maxDailyMessages: 999,
      maxStorageMb: 50000,
    },
  };
  return perms[tier as keyof typeof perms] ?? perms.FREE;
}

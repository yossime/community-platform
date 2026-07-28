import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./stripe', () => ({
  stripe: {
    paymentIntents: {
      create: vi.fn().mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'pi_test_123_secret',
        status: 'requires_capture',
      }),
      capture: vi.fn().mockResolvedValue({
        id: 'pi_test_123',
        status: 'succeeded',
      }),
    },
    refunds: {
      create: vi.fn().mockResolvedValue({
        id: 'ref_test_123',
        status: 'succeeded',
      }),
    },
  },
}));

import { createEscrowPayment, captureEscrowPayment, refundEscrowPayment } from './escrow';
import { stripe } from './stripe';

const mockedStripe = vi.mocked(stripe);

describe('Escrow Payments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createEscrowPayment', () => {
    it('creates a payment intent with manual capture', async () => {
      const result = await createEscrowPayment({
        amountAgorot: 50000,
        milestoneId: 'milestone-1',
        payerId: 'payer-1',
        payeeId: 'payee-1',
      });

      expect(result.paymentIntentId).toBe('pi_test_123');
      expect(result.clientSecret).toBe('pi_test_123_secret');
      expect(result.status).toBe('requires_capture');

      expect(mockedStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 50000,
        currency: 'ils',
        metadata: {
          milestoneId: 'milestone-1',
          payerId: 'payer-1',
          payeeId: 'payee-1',
        },
        capture_method: 'manual',
      });
    });

    it('includes optional metadata', async () => {
      await createEscrowPayment({
        amountAgorot: 10000,
        milestoneId: 'milestone-2',
        payerId: 'p1',
        payeeId: 'p2',
        metadata: { projectId: 'proj-1' },
      });

      expect(mockedStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ projectId: 'proj-1' }),
        })
      );
    });
  });

  describe('captureEscrowPayment', () => {
    it('captures a held payment', async () => {
      const result = await captureEscrowPayment('pi_test_123');
      expect(result.status).toBe('succeeded');
      expect(mockedStripe.paymentIntents.capture).toHaveBeenCalledWith('pi_test_123');
    });
  });

  describe('refundEscrowPayment', () => {
    it('refunds a payment', async () => {
      const result = await refundEscrowPayment('pi_test_123');
      expect(result.status).toBe('succeeded');
      expect(mockedStripe.refunds.create).toHaveBeenCalledWith({
        payment_intent: 'pi_test_123',
      });
    });
  });
});

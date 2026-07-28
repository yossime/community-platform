import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./stripe', () => ({
  stripe: {
    accounts: {
      create: vi.fn().mockResolvedValue({
        id: 'acct_test_123',
        type: 'express',
        country: 'IL',
      }),
      retrieve: vi.fn().mockResolvedValue({
        id: 'acct_test_123',
        charges_enabled: true,
      }),
      createLoginLink: vi.fn().mockResolvedValue({
        url: 'https://connect.stripe.com/login/test',
      }),
    },
    accountLinks: {
      create: vi.fn().mockResolvedValue({
        url: 'https://connect.stripe.com/setup/test',
      }),
    },
    transfers: {
      create: vi.fn().mockResolvedValue({
        id: 'tr_test_123',
        amount: 10000,
      }),
    },
  },
}));

import {
  createConnectAccount,
  createAccountLink,
  createLoginLink,
  transferToFreelancer,
  getConnectAccount,
} from './connect';
import { stripe } from './stripe';

const mockedStripe = vi.mocked(stripe);

describe('Stripe Connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createConnectAccount', () => {
    it('creates an express Connect account for Israel', async () => {
      const result = await createConnectAccount('user-1', 'test@example.com');

      expect(result.id).toBe('acct_test_123');
      expect(result.type).toBe('express');
      expect(mockedStripe.accounts.create).toHaveBeenCalledWith({
        type: 'express',
        country: 'IL',
        email: 'test@example.com',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { userId: 'user-1' },
      });
    });
  });

  describe('createAccountLink', () => {
    it('generates onboarding link', async () => {
      const result = await createAccountLink(
        'acct_test_123',
        'https://app.com/refresh',
        'https://app.com/return',
      );

      expect(result.url).toContain('connect.stripe.com');
      expect(mockedStripe.accountLinks.create).toHaveBeenCalledWith({
        account: 'acct_test_123',
        refresh_url: 'https://app.com/refresh',
        return_url: 'https://app.com/return',
        type: 'account_onboarding',
      });
    });
  });

  describe('createLoginLink', () => {
    it('generates dashboard login link', async () => {
      const result = await createLoginLink('acct_test_123');
      expect(result.url).toContain('connect.stripe.com');
    });
  });

  describe('transferToFreelancer', () => {
    it('creates transfer to connected account', async () => {
      const result = await transferToFreelancer(10000, 'acct_test_123', {
        milestoneId: 'ms-1',
        projectId: 'proj-1',
      });

      expect(result.amount).toBe(10000);
      expect(mockedStripe.transfers.create).toHaveBeenCalledWith({
        amount: 10000,
        currency: 'ils',
        destination: 'acct_test_123',
        metadata: { milestoneId: 'ms-1', projectId: 'proj-1' },
      });
    });
  });

  describe('getConnectAccount', () => {
    it('retrieves account details', async () => {
      const result = await getConnectAccount('acct_test_123');
      expect(result.charges_enabled).toBe(true);
      expect(mockedStripe.accounts.retrieve).toHaveBeenCalledWith('acct_test_123');
    });
  });
});

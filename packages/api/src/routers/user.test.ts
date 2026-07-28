import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// Mock rate limiters before importing routers
vi.mock('@platform/cache/src/rate-limit', () => ({
  apiRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
  contentCreationRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
  searchRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}));

vi.mock('@platform/ai/src/sanitize', () => ({
  sanitizeText: vi.fn((text: string) => ({ text, warnings: [] })),
  validateLength: vi.fn(() => null),
}));

import { appRouter, createCaller } from '../root';
import type { Context } from '../trpc';

function createMockContext(overrides: Partial<Context> = {}): Context {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      userSettings: {
        create: vi.fn(),
        update: vi.fn(),
      },
      membership: {
        create: vi.fn(),
      },
      reputation: {
        create: vi.fn(),
      },
      $transaction: vi.fn((fn: unknown) => {
        if (typeof fn === 'function') {
          return fn({
            user: { create: vi.fn().mockResolvedValue({ id: 'new-user-id', username: 'testuser', slug: 'testuser' }) },
            userSettings: { create: vi.fn() },
            membership: { create: vi.fn() },
            reputation: { create: vi.fn() },
          });
        }
        return Promise.resolve(fn);
      }),
    } as unknown as Context['prisma'],
    supabase: {} as unknown as Context['supabase'],
    userId: undefined,
    userRole: undefined,
    clientIp: '127.0.0.1',
    ...overrides,
  };
}

describe('User Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProfile', () => {
    it('returns user profile when found', async () => {
      const mockUser = {
        id: 'user-1',
        displayName: 'Test User',
        slug: 'test-user',
        skills: [],
        reputation: { points: 100 },
        membership: { tier: 'FREE' },
      };

      const ctx = createMockContext();
      (ctx.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const caller = createCaller(ctx);
      const result = await caller.user.getProfile({ slug: 'test-user' });

      expect(result).toEqual(mockUser);
      expect(ctx.prisma.user.findUnique).toHaveBeenCalledWith({
        where: { slug: 'test-user' },
        include: {
          skills: { include: { tag: true } },
          reputation: true,
          membership: true,
        },
      });
    });

    it('throws NOT_FOUND when user does not exist', async () => {
      const ctx = createMockContext();
      (ctx.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const caller = createCaller(ctx);
      await expect(caller.user.getProfile({ slug: 'nonexistent' })).rejects.toThrow(TRPCError);
    });
  });

  describe('getMe', () => {
    it('returns current user profile', async () => {
      const mockUser = {
        id: 'user-1',
        settings: { theme: 'light' },
        membership: { tier: 'FREE' },
        reputation: { points: 0 },
      };

      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const caller = createCaller(ctx);
      const result = await caller.user.getMe();

      expect(result).toEqual(mockUser);
    });

    it('throws UNAUTHORIZED when not authenticated', async () => {
      const ctx = createMockContext({ userId: undefined });

      const caller = createCaller(ctx);
      await expect(caller.user.getMe()).rejects.toThrow(TRPCError);
    });
  });

  describe('checkUsernameAvailability', () => {
    it('returns available true when username is free', async () => {
      const ctx = createMockContext();
      (ctx.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const caller = createCaller(ctx);
      const result = await caller.user.checkUsernameAvailability({ username: 'newuser' });

      expect(result).toEqual({ available: true });
    });

    it('returns available false when username is taken', async () => {
      const ctx = createMockContext();
      (ctx.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing' });

      const caller = createCaller(ctx);
      const result = await caller.user.checkUsernameAvailability({ username: 'taken' });

      expect(result).toEqual({ available: false });
    });
  });

  describe('updateProfile', () => {
    it('updates profile fields', async () => {
      const mockUpdated = { id: 'user-1', displayName: 'Updated Name', bio: 'New bio' };
      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUpdated);

      const caller = createCaller(ctx);
      const result = await caller.user.updateProfile({
        displayName: 'Updated Name',
        bio: 'New bio',
      });

      expect(result).toEqual(mockUpdated);
      expect(ctx.prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { displayName: 'Updated Name', bio: 'New bio' },
      });
    });

    it('rejects unauthenticated update', async () => {
      const ctx = createMockContext({ userId: undefined });

      const caller = createCaller(ctx);
      await expect(
        caller.user.updateProfile({ displayName: 'Hacker' })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('updateSettings', () => {
    it('updates user settings', async () => {
      const mockSettings = { userId: 'user-1', theme: 'dark' };
      const ctx = createMockContext({ userId: 'user-1' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx.prisma.userSettings as any).update.mockResolvedValue(mockSettings);

      const caller = createCaller(ctx);
      const result = await caller.user.updateSettings({ theme: 'dark' });

      expect(result).toEqual(mockSettings);
    });
  });

  describe('input validation', () => {
    it('rejects invalid username format in checkUsernameAvailability', async () => {
      const ctx = createMockContext();
      const caller = createCaller(ctx);

      await expect(
        caller.user.checkUsernameAvailability({ username: 'ab' })
      ).rejects.toThrow(); // min 3 chars
    });

    it('rejects empty slug in getProfile', async () => {
      const ctx = createMockContext();
      const caller = createCaller(ctx);

      // Empty string should fail
      await expect(
        caller.user.getProfile({ slug: '' })
      ).rejects.toThrow();
    });
  });
});

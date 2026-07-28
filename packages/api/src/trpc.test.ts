import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// Mock rate limiters
vi.mock('@platform/cache/src/rate-limit', () => ({
  apiRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
  contentCreationRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
  searchRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}));

import { createTRPCContext, type CreateContextOptions } from './trpc';

describe('tRPC Context', () => {
  it('creates context with all fields', () => {
    const opts: CreateContextOptions = {
      prisma: {} as CreateContextOptions['prisma'],
      supabase: {} as CreateContextOptions['supabase'],
      userId: 'user-1',
      userRole: 'ADMIN',
      clientIp: '127.0.0.1',
    };

    const ctx = createTRPCContext(opts);

    expect(ctx.userId).toBe('user-1');
    expect(ctx.userRole).toBe('ADMIN');
    expect(ctx.clientIp).toBe('127.0.0.1');
  });

  it('converts null userId to undefined', () => {
    const opts: CreateContextOptions = {
      prisma: {} as CreateContextOptions['prisma'],
      supabase: {} as CreateContextOptions['supabase'],
      userId: null,
      userRole: null,
      clientIp: null,
    };

    const ctx = createTRPCContext(opts);

    expect(ctx.userId).toBeUndefined();
    expect(ctx.userRole).toBeUndefined();
    expect(ctx.clientIp).toBeUndefined();
  });
});

describe('tRPC Middleware', () => {
  describe('Rate Limiting', () => {
    it('blocks when rate limit exceeded', async () => {
      const { apiRateLimit } = await import('@platform/cache/src/rate-limit');
      (apiRateLimit.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false });

      // Import after mock is set up
      const { createCaller } = await import('./root');

      const ctx = createTRPCContext({
        prisma: { forumCategory: { findMany: vi.fn() } } as unknown as CreateContextOptions['prisma'],
        supabase: {} as CreateContextOptions['supabase'],
        userId: null,
        userRole: null,
        clientIp: '127.0.0.1',
      });

      const caller = createCaller(ctx);

      await expect(caller.forum.listCategories()).rejects.toThrow(TRPCError);
    });
  });

  describe('Protected Procedure', () => {
    it('blocks unauthenticated users', async () => {
      const { createCaller } = await import('./root');

      const ctx = createTRPCContext({
        prisma: {} as CreateContextOptions['prisma'],
        supabase: {} as CreateContextOptions['supabase'],
        userId: null,
        userRole: null,
        clientIp: '127.0.0.1',
      });

      const caller = createCaller(ctx);
      await expect(caller.notification.unreadCount()).rejects.toThrow(TRPCError);
    });
  });
});

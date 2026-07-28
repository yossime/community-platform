import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

vi.mock('@platform/cache/src/rate-limit', () => ({
  apiRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
  contentCreationRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
  searchRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}));

import { createCaller } from '../root';
import type { Context } from '../trpc';

function createMockContext(overrides: Partial<Context> = {}): Context {
  return {
    prisma: {
      notification: {
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
    } as unknown as Context['prisma'],
    supabase: {} as unknown as Context['supabase'],
    userId: undefined,
    userRole: undefined,
    clientIp: '127.0.0.1',
    ...overrides,
  };
}

describe('Notification Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns user notifications', async () => {
      const mockNotifications = [
        { id: 'n1', title: 'New reply', readAt: null },
        { id: 'n2', title: 'Mentioned', readAt: new Date() },
      ];

      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.notification.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockNotifications);

      const caller = createCaller(ctx);
      const result = await caller.notification.list({});

      expect(result.notifications).toEqual(mockNotifications);
    });

    it('filters unread only', async () => {
      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.notification.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const caller = createCaller(ctx);
      await caller.notification.list({ unreadOnly: true });

      expect(ctx.prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ readAt: null }),
        })
      );
    });

    it('rejects unauthenticated access', async () => {
      const ctx = createMockContext({ userId: undefined });

      const caller = createCaller(ctx);
      await expect(caller.notification.list({})).rejects.toThrow(TRPCError);
    });
  });

  describe('unreadCount', () => {
    it('returns count of unread notifications', async () => {
      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.notification.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);

      const caller = createCaller(ctx);
      const result = await caller.notification.unreadCount();

      expect(result).toBe(5);
      expect(ctx.prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
      });
    });
  });

  describe('markAsRead', () => {
    it('marks specific notifications as read', async () => {
      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.notification.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 });

      const caller = createCaller(ctx);
      const result = await caller.notification.markAsRead({ ids: ['n1', 'n2'] });

      expect(result.count).toBe(2);
      expect(ctx.prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['n1', 'n2'] }, userId: 'user-1' },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe('markAllAsRead', () => {
    it('marks all unread notifications as read', async () => {
      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.notification.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 10 });

      const caller = createCaller(ctx);
      const result = await caller.notification.markAllAsRead();

      expect(result.count).toBe(10);
      expect(ctx.prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });
});

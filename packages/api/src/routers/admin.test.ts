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
      thread: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
      post: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
      project: { findMany: vi.fn(), update: vi.fn() },
      user: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
      moderationLog: { create: vi.fn() },
    } as unknown as Context['prisma'],
    supabase: {} as unknown as Context['supabase'],
    userId: undefined,
    userRole: undefined,
    clientIp: '127.0.0.1',
    ...overrides,
  };
}

describe('Admin Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authorization', () => {
    it('rejects unauthenticated users for moderation', async () => {
      const ctx = createMockContext();
      const caller = createCaller(ctx);

      await expect(caller.admin.getModerationQueue({})).rejects.toThrow(TRPCError);
    });

    it('rejects non-moderator users', async () => {
      const ctx = createMockContext({ userId: 'user-1', userRole: 'USER' });
      const caller = createCaller(ctx);

      await expect(caller.admin.getModerationQueue({})).rejects.toThrow(TRPCError);
    });

    it('allows moderators access', async () => {
      const ctx = createMockContext({ userId: 'mod-1', userRole: 'MODERATOR' });
      (ctx.prisma.thread.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const caller = createCaller(ctx);
      const result = await caller.admin.getModerationQueue({});

      expect(result.type).toBe('Thread');
    });

    it('allows admins access', async () => {
      const ctx = createMockContext({ userId: 'admin-1', userRole: 'ADMIN' });
      (ctx.prisma.thread.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const caller = createCaller(ctx);
      const result = await caller.admin.getModerationQueue({});

      expect(result.type).toBe('Thread');
    });

    it('rejects non-admin for admin-only endpoints', async () => {
      const ctx = createMockContext({ userId: 'mod-1', userRole: 'MODERATOR' });
      const caller = createCaller(ctx);

      await expect(caller.admin.listUsers({})).rejects.toThrow(TRPCError);
    });

    it('allows admin for admin-only endpoints', async () => {
      const ctx = createMockContext({ userId: 'admin-1', userRole: 'ADMIN' });
      (ctx.prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const caller = createCaller(ctx);
      const result = await caller.admin.listUsers({});

      expect(result.users).toEqual([]);
    });
  });

  describe('getModerationQueue', () => {
    it('returns pending threads by default', async () => {
      const mockThreads = [
        { id: 't1', title: 'Pending Thread', author: { displayName: 'User' } },
      ];

      const ctx = createMockContext({ userId: 'mod-1', userRole: 'MODERATOR' });
      (ctx.prisma.thread.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockThreads);

      const caller = createCaller(ctx);
      const result = await caller.admin.getModerationQueue({});

      expect(result.items).toEqual(mockThreads);
      expect(result.type).toBe('Thread');
    });

    it('returns pending posts when type is Post', async () => {
      const ctx = createMockContext({ userId: 'mod-1', userRole: 'MODERATOR' });
      (ctx.prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const caller = createCaller(ctx);
      const result = await caller.admin.getModerationQueue({ entityType: 'Post' });

      expect(result.type).toBe('Post');
    });
  });

  describe('moderateContent', () => {
    it('approves content and creates log', async () => {
      const ctx = createMockContext({ userId: 'mod-1', userRole: 'MODERATOR' });
      (ctx.prisma.thread.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (ctx.prisma.moderationLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const caller = createCaller(ctx);
      const result = await caller.admin.moderateContent({
        entityType: 'Thread',
        entityId: 't1',
        action: 'APPROVE',
      });

      expect(result.success).toBe(true);
      expect(ctx.prisma.thread.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { moderationStatus: 'APPROVED' },
      });
      expect(ctx.prisma.moderationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          moderatorId: 'mod-1',
          action: 'APPROVE',
          newStatus: 'APPROVED',
          isAutomatic: false,
        }),
      });
    });

    it('rejects content with reason', async () => {
      const ctx = createMockContext({ userId: 'mod-1', userRole: 'MODERATOR' });
      (ctx.prisma.post.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (ctx.prisma.moderationLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const caller = createCaller(ctx);
      await caller.admin.moderateContent({
        entityType: 'Post',
        entityId: 'p1',
        action: 'REJECT',
        reason: 'Inappropriate content',
      });

      expect(ctx.prisma.moderationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reason: 'Inappropriate content',
          newStatus: 'REJECTED',
        }),
      });
    });
  });

  describe('getStats', () => {
    it('returns platform stats', async () => {
      const ctx = createMockContext({ userId: 'mod-1', userRole: 'MODERATOR' });
      (ctx.prisma.user.count as ReturnType<typeof vi.fn>).mockResolvedValue(1000);
      (ctx.prisma.thread.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
      (ctx.prisma.post.count as ReturnType<typeof vi.fn>).mockResolvedValue(12);

      const caller = createCaller(ctx);
      const result = await caller.admin.getStats();

      expect(result.userCount).toBe(1000);
      expect(result.pendingThreads).toBe(5);
      expect(result.pendingPosts).toBe(12);
      expect(result.pendingTotal).toBe(17);
    });
  });

  describe('updateUserStatus', () => {
    it('updates user status', async () => {
      const mockUser = { id: 'user-1', status: 'SUSPENDED' };
      const ctx = createMockContext({ userId: 'admin-1', userRole: 'ADMIN' });
      (ctx.prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const caller = createCaller(ctx);
      const result = await caller.admin.updateUserStatus({
        userId: 'user-1',
        status: 'SUSPENDED',
        reason: 'Violation of ToS',
      });

      expect(result.status).toBe('SUSPENDED');
    });
  });
});

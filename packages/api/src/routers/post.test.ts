import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

vi.mock('@platform/cache/src/rate-limit', () => ({
  apiRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
  contentCreationRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
  searchRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}));

vi.mock('@platform/ai/src/sanitize', () => ({
  sanitizeText: vi.fn((text: string) => ({ text, warnings: [] })),
  validateLength: vi.fn(() => null),
}));

import { createCaller } from '../root';
import type { Context } from '../trpc';

function createMockContext(overrides: Partial<Context> = {}): Context {
  return {
    prisma: {
      post: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      thread: { update: vi.fn() },
    } as unknown as Context['prisma'],
    supabase: {} as unknown as Context['supabase'],
    userId: undefined,
    userRole: undefined,
    clientIp: '127.0.0.1',
    ...overrides,
  };
}

describe('Post Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listByThread', () => {
    it('returns posts for a thread with pagination', async () => {
      const mockPosts = [
        { id: 'p1', content: 'Post 1', author: { displayName: 'User1' }, reactions: [] },
        { id: 'p2', content: 'Post 2', author: { displayName: 'User2' }, reactions: [] },
      ];

      const ctx = createMockContext();
      (ctx.prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockPosts);

      const caller = createCaller(ctx);
      const result = await caller.post.listByThread({ threadId: 'thread-1' });

      expect(result.posts).toEqual(mockPosts);
      expect(result.nextCursor).toBeUndefined();
    });

    it('filters only approved posts', async () => {
      const ctx = createMockContext();
      (ctx.prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const caller = createCaller(ctx);
      await caller.post.listByThread({ threadId: 't1' });

      expect(ctx.prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ moderationStatus: 'APPROVED' }),
        })
      );
    });
  });

  describe('create', () => {
    it('creates post and updates thread counters', async () => {
      const mockPost = { id: 'p1', content: 'New post', moderationStatus: 'PENDING' };

      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.post.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockPost);
      (ctx.prisma.thread.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const caller = createCaller(ctx);
      const result = await caller.post.create({
        threadId: 'thread-1',
        content: 'New post content',
      });

      expect(result.moderationStatus).toBe('PENDING');
      expect(ctx.prisma.thread.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'thread-1' },
          data: expect.objectContaining({
            postCount: { increment: 1 },
          }),
        })
      );
    });

    it('supports parent replies', async () => {
      const mockPost = { id: 'p1', parentId: 'parent-1' };

      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.post.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockPost);
      (ctx.prisma.thread.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const caller = createCaller(ctx);
      await caller.post.create({
        threadId: 'thread-1',
        content: 'Reply content',
        parentId: 'parent-1',
      });

      expect(ctx.prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parentId: 'parent-1' }),
        })
      );
    });

    it('rejects empty content', async () => {
      const ctx = createMockContext({ userId: 'user-1' });

      const caller = createCaller(ctx);
      await expect(
        caller.post.create({ threadId: 't1', content: '' })
      ).rejects.toThrow(); // min 1 char
    });
  });
});

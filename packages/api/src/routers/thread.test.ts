import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

vi.mock('@platform/cache/src/rate-limit', () => ({
  apiRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
  contentCreationRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
  searchRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}));

vi.mock('@platform/ai/src/sanitize', () => ({
  sanitizeText: vi.fn((text: string) => ({ text: text.replace(/<[^>]+>/g, ''), warnings: [] })),
  validateLength: vi.fn(() => null),
}));

import { createCaller } from '../root';
import type { Context } from '../trpc';

function createMockContext(overrides: Partial<Context> = {}): Context {
  return {
    prisma: {
      forum: { findUnique: vi.fn(), update: vi.fn() },
      thread: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
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

describe('Thread Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns threads for a forum with pagination', async () => {
      const mockForum = { id: 'forum-1', slug: 'javascript' };
      const mockThreads = [
        { id: 't1', title: 'Thread 1', author: { displayName: 'User1' } },
        { id: 't2', title: 'Thread 2', author: { displayName: 'User2' } },
      ];

      const ctx = createMockContext();
      (ctx.prisma.forum.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockForum);
      (ctx.prisma.thread.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockThreads);

      const caller = createCaller(ctx);
      const result = await caller.thread.list({ forumSlug: 'javascript' });

      expect(result.threads).toEqual(mockThreads);
      expect(result.nextCursor).toBeUndefined();
    });

    it('returns empty when forum not found', async () => {
      const ctx = createMockContext();
      (ctx.prisma.forum.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const caller = createCaller(ctx);
      const result = await caller.thread.list({ forumSlug: 'nonexistent' });

      expect(result.threads).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('provides nextCursor when more items available', async () => {
      const mockForum = { id: 'forum-1', slug: 'test' };
      // Return limit + 1 items to signal more data
      const mockThreads = Array.from({ length: 21 }, (_, i) => ({
        id: `t${i}`,
        title: `Thread ${i}`,
        author: { displayName: 'User' },
      }));

      const ctx = createMockContext();
      (ctx.prisma.forum.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockForum);
      (ctx.prisma.thread.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockThreads);

      const caller = createCaller(ctx);
      const result = await caller.thread.list({ forumSlug: 'test', limit: 20 });

      expect(result.threads).toHaveLength(20);
      expect(result.nextCursor).toBe('t20');
    });
  });

  describe('getBySlug', () => {
    it('returns thread with author and forum info', async () => {
      const mockThread = {
        id: 't1',
        title: 'Test Thread',
        slug: 'test-thread',
        author: { id: 'u1', displayName: 'Author' },
        forum: { id: 'f1', name: 'JS', slug: 'js' },
      };

      const ctx = createMockContext();
      (ctx.prisma.thread.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockThread);
      (ctx.prisma.thread.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockThread);

      const caller = createCaller(ctx);
      const result = await caller.thread.getBySlug({ slug: 'test-thread' });

      expect(result.title).toBe('Test Thread');
    });

    it('throws NOT_FOUND when thread does not exist', async () => {
      const ctx = createMockContext();
      (ctx.prisma.thread.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const caller = createCaller(ctx);
      await expect(caller.thread.getBySlug({ slug: 'missing' })).rejects.toThrow(TRPCError);
    });
  });

  describe('create', () => {
    it('creates thread with sanitized content', async () => {
      const mockThread = {
        id: 't1',
        title: 'New Thread',
        content: 'Thread content',
        moderationStatus: 'PENDING',
      };

      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.thread.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockThread);
      (ctx.prisma.forum.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const caller = createCaller(ctx);
      const result = await caller.thread.create({
        forumId: 'forum-1',
        title: 'New Thread',
        content: 'Thread content here',
      });

      expect(result.moderationStatus).toBe('PENDING');
      expect(ctx.prisma.thread.create).toHaveBeenCalled();
      expect(ctx.prisma.forum.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'forum-1' },
          data: expect.objectContaining({
            threadCount: { increment: 1 },
          }),
        })
      );
    });

    it('rejects unauthenticated thread creation', async () => {
      const ctx = createMockContext({ userId: undefined });

      const caller = createCaller(ctx);
      await expect(
        caller.thread.create({ forumId: 'f1', title: 'Test', content: 'Content here' })
      ).rejects.toThrow(TRPCError);
    });

    it('validates minimum title length', async () => {
      const ctx = createMockContext({ userId: 'user-1' });

      const caller = createCaller(ctx);
      await expect(
        caller.thread.create({ forumId: 'f1', title: 'ab', content: 'Valid content here' })
      ).rejects.toThrow(); // min 3 chars
    });

    it('validates minimum content length', async () => {
      const ctx = createMockContext({ userId: 'user-1' });

      const caller = createCaller(ctx);
      await expect(
        caller.thread.create({ forumId: 'f1', title: 'Valid Title', content: 'short' })
      ).rejects.toThrow(); // min 10 chars
    });
  });
});

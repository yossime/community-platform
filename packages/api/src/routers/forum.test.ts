import { describe, it, expect, vi, beforeEach } from 'vitest';

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
      forumCategory: { findMany: vi.fn() },
      forum: { findUnique: vi.fn(), findMany: vi.fn() },
    } as unknown as Context['prisma'],
    supabase: {} as unknown as Context['supabase'],
    userId: undefined,
    userRole: undefined,
    clientIp: '127.0.0.1',
    ...overrides,
  };
}

describe('Forum Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listCategories', () => {
    it('returns categories ordered by displayOrder', async () => {
      const mockCategories = [
        { id: '1', name: 'פיתוח', displayOrder: 1, children: [], forums: [] },
        { id: '2', name: 'עיצוב', displayOrder: 2, children: [], forums: [] },
      ];

      const ctx = createMockContext();
      (ctx.prisma.forumCategory.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockCategories);

      const caller = createCaller(ctx);
      const result = await caller.forum.listCategories();

      expect(result).toEqual(mockCategories);
      expect(ctx.prisma.forumCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { displayOrder: 'asc' },
          where: { parentId: null },
        })
      );
    });

    it('returns empty array when no categories exist', async () => {
      const ctx = createMockContext();
      (ctx.prisma.forumCategory.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const caller = createCaller(ctx);
      const result = await caller.forum.listCategories();

      expect(result).toEqual([]);
    });
  });

  describe('getById', () => {
    it('returns forum by slug', async () => {
      const mockForum = { id: '1', name: 'JavaScript', slug: 'javascript', category: { name: 'פיתוח' } };

      const ctx = createMockContext();
      (ctx.prisma.forum.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockForum);

      const caller = createCaller(ctx);
      const result = await caller.forum.getById({ slug: 'javascript' });

      expect(result).toEqual(mockForum);
      expect(ctx.prisma.forum.findUnique).toHaveBeenCalledWith({
        where: { slug: 'javascript' },
        include: { category: true },
      });
    });

    it('returns null when forum not found', async () => {
      const ctx = createMockContext();
      (ctx.prisma.forum.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const caller = createCaller(ctx);
      const result = await caller.forum.getById({ slug: 'nonexistent' });

      expect(result).toBeNull();
    });
  });
});

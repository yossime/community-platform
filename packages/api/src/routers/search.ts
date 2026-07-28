import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { searchIndex } from '@platform/search/src/sync';
import { INDEXES, type IndexName } from '@platform/search/src/indexes';

import { createTRPCRouter, searchProcedure, protectedProcedure, publicProcedure } from '../trpc';

const searchTypeSchema = z.enum([
  'threads',
  'projects',
  'classifieds',
  'articles',
  'courses',
  'users',
  'portfolios',
]);

export const searchRouter = createTRPCRouter({
  // ─── Global Federated Search ─────────────────────────

  global: searchProcedure
    .input(
      z.object({
        query: z.string().min(2).max(200),
        type: searchTypeSchema.optional(),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const { query, type, limit, offset } = input;

      // If a specific type is requested, search only that index
      if (type) {
        try {
          const result = await searchIndex(type as IndexName, query, { limit, offset });
          return {
            results: result.hits.map((hit) => ({
              ...hit,
              _type: type,
            })),
            query,
            type,
            total: result.estimatedTotalHits ?? result.hits.length,
          };
        } catch {
          return { results: [], query, type, total: 0 };
        }
      }

      // Federated search: search all indexes in parallel
      const indexNames = Object.keys(INDEXES) as IndexName[];
      try {
        const searchResults = await Promise.allSettled(
          indexNames.map(async (indexName) => {
            const result = await searchIndex(indexName, query, { limit: 5 });
            return {
              indexName,
              hits: result.hits.map((hit) => ({
                ...hit,
                _type: indexName,
              })),
              total: result.estimatedTotalHits ?? result.hits.length,
            };
          }),
        );

        const results: Array<Record<string, unknown>> = [];
        const facets: Record<string, number> = {};
        let total = 0;

        for (const result of searchResults) {
          if (result.status === 'fulfilled') {
            results.push(...result.value.hits);
            facets[result.value.indexName] = result.value.total;
            total += result.value.total;
          }
        }

        return { results, query, type: undefined, total, facets };
      } catch {
        return { results: [], query, type: undefined, total: 0, facets: {} };
      }
    }),

  // ─── Autocomplete (lightweight) ──────────────────────

  autocomplete: searchProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ input }) => {
      const { query } = input;
      const suggestions: Array<{ text: string; type: string; slug?: string }> = [];

      try {
        // Search multiple indexes with small limit for quick results
        const [threads, articles, courses, users] = await Promise.allSettled([
          searchIndex('threads', query, { limit: 3 }),
          searchIndex('articles', query, { limit: 3 }),
          searchIndex('courses', query, { limit: 3 }),
          searchIndex('users', query, { limit: 3 }),
        ]);

        if (threads.status === 'fulfilled') {
          for (const hit of threads.value.hits) {
            suggestions.push({ text: (hit as { title?: string }).title ?? '', type: 'thread', slug: (hit as { slug?: string }).slug });
          }
        }
        if (articles.status === 'fulfilled') {
          for (const hit of articles.value.hits) {
            suggestions.push({ text: (hit as { title?: string }).title ?? '', type: 'article', slug: (hit as { slug?: string }).slug });
          }
        }
        if (courses.status === 'fulfilled') {
          for (const hit of courses.value.hits) {
            suggestions.push({ text: (hit as { title?: string }).title ?? '', type: 'course', slug: (hit as { slug?: string }).slug });
          }
        }
        if (users.status === 'fulfilled') {
          for (const hit of users.value.hits) {
            suggestions.push({ text: (hit as { displayName?: string }).displayName ?? '', type: 'user', slug: (hit as { slug?: string }).slug });
          }
        }
      } catch {
        // Silently fail for autocomplete
      }

      return suggestions.slice(0, 8);
    }),

  // ─── Semantic Search (pgvector) ──────────────────────

  semantic: searchProcedure
    .input(
      z.object({
        query: z.string().min(5).max(500),
        entityType: z.enum(['thread', 'project', 'article', 'course', 'freelancer']).optional(),
        limit: z.number().min(1).max(20).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const { generateEmbedding } = await import('@platform/ai/src/embeddings');
        const embedding = await generateEmbedding(input.query);

        // Use raw SQL for pgvector cosine similarity search
        const typeFilter = input.entityType
          ? `AND entity_type = '${input.entityType}'`
          : '';

        const results = await ctx.prisma.$queryRawUnsafe<
          Array<{ id: string; entity_type: string; entity_id: string; content: string; similarity: number }>
        >(
          `SELECT id, entity_type, entity_id, content,
           1 - (embedding <=> $1::vector) as similarity
           FROM search_embeddings
           WHERE 1 = 1 ${typeFilter}
           ORDER BY embedding <=> $1::vector
           LIMIT $2`,
          `[${embedding.join(',')}]`,
          input.limit,
        );

        return results.map((r) => ({
          entityType: r.entity_type,
          entityId: r.entity_id,
          content: r.content.slice(0, 200),
          similarity: r.similarity,
        }));
      } catch (error) {
        console.error('Semantic search error:', error);
        return [];
      }
    }),

  // ─── Trending / Popular ──────────────────────────────

  trending: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }))
    .query(async ({ ctx, input }) => {
      const [threads, articles, projects] = await Promise.all([
        ctx.prisma.thread.findMany({
          where: { moderationStatus: 'APPROVED', status: 'OPEN' },
          orderBy: { viewCount: 'desc' },
          take: input.limit,
          select: { id: true, title: true, slug: true, viewCount: true, postCount: true },
        }),
        ctx.prisma.article.findMany({
          where: { isPublished: true, moderationStatus: 'APPROVED' },
          orderBy: { viewCount: 'desc' },
          take: input.limit,
          select: { id: true, title: true, slug: true, viewCount: true, likeCount: true },
        }),
        ctx.prisma.project.findMany({
          where: { moderationStatus: 'APPROVED', status: 'OPEN' },
          orderBy: { viewCount: 'desc' },
          take: input.limit,
          select: { id: true, title: true, slug: true, viewCount: true, proposalCount: true },
        }),
      ]);

      return {
        threads: threads.map((t) => ({ ...t, _type: 'thread' as const })),
        articles: articles.map((a) => ({ ...a, _type: 'article' as const })),
        projects: projects.map((p) => ({ ...p, _type: 'project' as const })),
      };
    }),
});

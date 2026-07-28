import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { sanitizeText } from '@platform/ai/src/sanitize';

import { createTRPCRouter, contentMutationProcedure, publicProcedure } from '../trpc';

export const threadRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        forumSlug: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const forum = await ctx.prisma.forum.findUnique({
        where: { slug: input.forumSlug },
      });
      if (!forum) return { threads: [], nextCursor: undefined };

      const threads = await ctx.prisma.thread.findMany({
        where: {
          forumId: forum.id,
          moderationStatus: 'APPROVED',
        },
        orderBy: [{ isPinned: 'desc' }, { lastPostAt: 'desc' }],
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          author: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
        },
      });

      let nextCursor: string | undefined;
      if (threads.length > input.limit) {
        const nextItem = threads.pop();
        nextCursor = nextItem?.id;
      }

      return { threads, nextCursor };
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const thread = await ctx.prisma.thread.findUnique({
        where: { slug: input.slug },
        include: {
          author: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
          forum: { select: { id: true, name: true, slug: true } },
        },
      });

      if (!thread) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'הנושא לא נמצא' });
      }

      // Increment view count (fire-and-forget)
      ctx.prisma.thread.update({
        where: { id: thread.id },
        data: { viewCount: { increment: 1 } },
      }).catch(() => {});

      return thread;
    }),

  create: contentMutationProcedure
    .input(
      z.object({
        forumId: z.string(),
        title: z.string().min(3).max(200),
        content: z.string().min(10),
        format: z.enum(['FLAT', 'THREADED', 'QA']).default('FLAT'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Stage 1: Sanitize
      const sanitizedTitle = sanitizeText(input.title);
      const sanitizedContent = sanitizeText(input.content);

      const slug = input.title
        .toLowerCase()
        .replace(/[^a-z0-9\u0590-\u05FF]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 100) + '-' + Date.now().toString(36);

      const thread = await ctx.prisma.thread.create({
        data: {
          forumId: input.forumId,
          title: sanitizedTitle.text,
          content: sanitizedContent.text,
          slug,
          format: input.format,
          authorId: ctx.userId as string,
          moderationStatus: 'PENDING',
          lastPostAt: new Date(),
        },
      });

      // Update forum counters
      await ctx.prisma.forum.update({
        where: { id: input.forumId },
        data: {
          threadCount: { increment: 1 },
          lastPostAt: new Date(),
        },
      });

      return thread;
    }),
});

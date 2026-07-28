import { z } from 'zod';

import { sanitizeText } from '@platform/ai/src/sanitize';

import { createTRPCRouter, contentMutationProcedure, publicProcedure } from '../trpc';

export const postRouter = createTRPCRouter({
  listByThread: publicProcedure
    .input(
      z.object({
        threadId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const posts = await ctx.prisma.post.findMany({
        where: {
          threadId: input.threadId,
          moderationStatus: 'APPROVED',
        },
        orderBy: { createdAt: 'asc' },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          author: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
          reactions: true,
        },
      });

      let nextCursor: string | undefined;
      if (posts.length > input.limit) {
        const nextItem = posts.pop();
        nextCursor = nextItem?.id;
      }

      return { posts, nextCursor };
    }),

  create: contentMutationProcedure
    .input(
      z.object({
        threadId: z.string(),
        content: z.string().min(1),
        parentId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Sanitize content
      const sanitized = sanitizeText(input.content);

      const post = await ctx.prisma.post.create({
        data: {
          threadId: input.threadId,
          content: sanitized.text,
          parentId: input.parentId,
          authorId: ctx.userId as string,
          moderationStatus: 'PENDING',
        },
      });

      // Update thread counters
      await ctx.prisma.thread.update({
        where: { id: input.threadId },
        data: {
          postCount: { increment: 1 },
          lastPostAt: new Date(),
        },
      });

      return post;
    }),
});

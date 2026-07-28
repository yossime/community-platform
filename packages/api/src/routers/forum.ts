import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '../trpc';

export const forumRouter = createTRPCRouter({
  listCategories: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.forumCategory.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        children: { orderBy: { displayOrder: 'asc' } },
        forums: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            threadCount: true,
            postCount: true,
            lastPostAt: true,
          },
        },
      },
      where: { parentId: null },
    });
  }),

  getById: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.forum.findUnique({
        where: { slug: input.slug },
        include: {
          category: true,
        },
      });
    }),
});

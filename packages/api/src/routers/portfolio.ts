import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  contentMutationProcedure,
} from '../trpc';

export const portfolioRouter = createTRPCRouter({
  // ─── Portfolio ────────────────────────────────────────

  getByUserSlug: publicProcedure
    .input(z.object({ userSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { slug: input.userSlug },
        select: { id: true, displayName: true, slug: true, avatarUrl: true, bio: true },
      });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'המשתמש לא נמצא' });

      const portfolio = await ctx.prisma.portfolio.findUnique({
        where: { userId: user.id },
        include: {
          projects: {
            orderBy: { displayOrder: 'asc' },
            include: {
              media: { orderBy: { displayOrder: 'asc' }, take: 1 },
              _count: { select: { likes: true, comments: true } },
            },
          },
        },
      });

      if (!portfolio) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'תיק העבודות לא נמצא' });
      }

      // Increment view count
      await ctx.prisma.portfolio.update({
        where: { id: portfolio.id },
        data: { viewCount: { increment: 1 } },
      });

      return { ...portfolio, user };
    }),

  explore: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        category: z.string().optional(),
        sortBy: z.enum(['newest', 'popular', 'most_liked']).default('newest'),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orderBy = {
        newest: { createdAt: 'desc' as const },
        popular: { viewCount: 'desc' as const },
        most_liked: { likeCount: 'desc' as const },
      }[input.sortBy];

      const projects = await ctx.prisma.portfolioProject.findMany({
        where: {
          ...(input.category ? { category: input.category } : {}),
          portfolio: { visibility: 'PUBLIC' },
        },
        orderBy,
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          media: { orderBy: { displayOrder: 'asc' }, take: 1 },
          portfolio: {
            include: {
              user: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
            },
          },
          _count: { select: { likes: true, comments: true } },
        },
      });

      let nextCursor: string | undefined;
      if (projects.length > input.limit) {
        const nextItem = projects.pop();
        nextCursor = nextItem?.id;
      }

      return { projects, nextCursor };
    }),

  getProject: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.portfolioProject.findUnique({
        where: { slug: input.slug },
        include: {
          media: { orderBy: { displayOrder: 'asc' } },
          portfolio: {
            include: {
              user: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
            },
          },
          _count: { select: { likes: true, comments: true } },
          comments: {
            where: { moderationStatus: 'APPROVED', parentId: null },
            orderBy: { createdAt: 'asc' },
            include: {
              author: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
              children: {
                where: { moderationStatus: 'APPROVED' },
                orderBy: { createdAt: 'asc' },
                include: {
                  author: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
                },
              },
            },
          },
        },
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'הפרויקט לא נמצא' });
      }

      // Increment view count
      await ctx.prisma.portfolioProject.update({
        where: { id: project.id },
        data: { viewCount: { increment: 1 } },
      });

      return project;
    }),

  // ─── Portfolio Management ─────────────────────────────

  myPortfolio: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.portfolio.findUnique({
      where: { userId: ctx.userId! },
      include: {
        projects: {
          orderBy: { displayOrder: 'asc' },
          include: {
            media: { orderBy: { displayOrder: 'asc' } },
            _count: { select: { likes: true, comments: true } },
          },
        },
      },
    });
  }),

  createPortfolio: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(200),
        description: z.string().max(1000).optional(),
        visibility: z.enum(['PUBLIC', 'PRIVATE', 'UNLISTED']).default('PUBLIC'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.portfolio.findUnique({ where: { userId: ctx.userId! } });
      if (existing) throw new TRPCError({ code: 'BAD_REQUEST', message: 'כבר יש לך תיק עבודות' });

      return ctx.prisma.portfolio.create({
        data: {
          userId: ctx.userId!,
          title: input.title,
          description: input.description,
          visibility: input.visibility,
        },
      });
    }),

  updatePortfolio: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(200).optional(),
        description: z.string().max(1000).optional(),
        visibility: z.enum(['PUBLIC', 'PRIVATE', 'UNLISTED']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const portfolio = await ctx.prisma.portfolio.findUnique({ where: { userId: ctx.userId! } });
      if (!portfolio) throw new TRPCError({ code: 'NOT_FOUND', message: 'תיק עבודות לא נמצא' });

      return ctx.prisma.portfolio.update({
        where: { userId: ctx.userId! },
        data: input,
      });
    }),

  // ─── Portfolio Projects ───────────────────────────────

  createProject: contentMutationProcedure
    .input(
      z.object({
        title: z.string().min(3).max(200),
        description: z.string().min(10).max(5000),
        processNotes: z.string().max(5000).optional(),
        coverImageUrl: z.string().url(),
        category: z.string().optional(),
        tags: z.array(z.string()).max(10).default([]),
        tools: z.array(z.string()).max(10).default([]),
        completedAt: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let portfolio = await ctx.prisma.portfolio.findUnique({ where: { userId: ctx.userId! } });
      if (!portfolio) {
        // Auto-create portfolio
        portfolio = await ctx.prisma.portfolio.create({
          data: {
            userId: ctx.userId!,
            title: 'תיק עבודות',
          },
        });
      }

      const slug =
        input.title
          .toLowerCase()
          .replace(/[^a-z0-9\u0590-\u05FF]+/g, '-')
          .replace(/(^-|-$)/g, '')
          .slice(0, 100) +
        '-' +
        Date.now().toString(36);

      const maxOrder = await ctx.prisma.portfolioProject.aggregate({
        where: { portfolioId: portfolio.id },
        _max: { displayOrder: true },
      });

      return ctx.prisma.portfolioProject.create({
        data: {
          portfolioId: portfolio.id,
          title: input.title,
          description: input.description,
          processNotes: input.processNotes,
          coverImageUrl: input.coverImageUrl,
          category: input.category,
          tags: input.tags,
          tools: input.tools,
          completedAt: input.completedAt,
          slug,
          displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
        },
      });
    }),

  updateProject: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(3).max(200).optional(),
        description: z.string().min(10).max(5000).optional(),
        processNotes: z.string().max(5000).optional(),
        coverImageUrl: z.string().url().optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).max(10).optional(),
        tools: z.array(z.string()).max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.portfolioProject.findUnique({
        where: { id: input.id },
        include: { portfolio: true },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'הפרויקט לא נמצא' });
      if (project.portfolio.userId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה לערוך פרויקט זה' });
      }

      const { id, ...data } = input;
      return ctx.prisma.portfolioProject.update({ where: { id }, data });
    }),

  deleteProject: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.portfolioProject.findUnique({
        where: { id: input.id },
        include: { portfolio: true },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'הפרויקט לא נמצא' });
      if (project.portfolio.userId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה למחוק פרויקט זה' });
      }

      return ctx.prisma.portfolioProject.delete({ where: { id: input.id } });
    }),

  reorderProjects: protectedProcedure
    .input(
      z.object({
        projectIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const portfolio = await ctx.prisma.portfolio.findUnique({ where: { userId: ctx.userId! } });
      if (!portfolio) throw new TRPCError({ code: 'NOT_FOUND', message: 'תיק עבודות לא נמצא' });

      await ctx.prisma.$transaction(
        input.projectIds.map((id, index) =>
          ctx.prisma.portfolioProject.update({
            where: { id },
            data: { displayOrder: index + 1 },
          }),
        ),
      );

      return { success: true };
    }),

  // ─── Media ────────────────────────────────────────────

  addMedia: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        url: z.string().url(),
        type: z.enum(['IMAGE', 'VIDEO']),
        caption: z.string().max(500).optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.portfolioProject.findUnique({
        where: { id: input.projectId },
        include: { portfolio: true },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'הפרויקט לא נמצא' });
      if (project.portfolio.userId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה להוסיף מדיה' });
      }

      const maxOrder = await ctx.prisma.portfolioMedia.aggregate({
        where: { projectId: input.projectId },
        _max: { displayOrder: true },
      });

      return ctx.prisma.portfolioMedia.create({
        data: {
          projectId: input.projectId,
          url: input.url,
          type: input.type,
          caption: input.caption,
          width: input.width,
          height: input.height,
          displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
        },
      });
    }),

  removeMedia: protectedProcedure
    .input(z.object({ mediaId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const media = await ctx.prisma.portfolioMedia.findUnique({
        where: { id: input.mediaId },
        include: { project: { include: { portfolio: true } } },
      });
      if (!media) throw new TRPCError({ code: 'NOT_FOUND', message: 'המדיה לא נמצאה' });
      if (media.project.portfolio.userId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה למחוק מדיה זו' });
      }

      return ctx.prisma.portfolioMedia.delete({ where: { id: input.mediaId } });
    }),

  // ─── Likes ────────────────────────────────────────────

  toggleLike: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.portfolioLike.findUnique({
        where: { projectId_userId: { projectId: input.projectId, userId: ctx.userId! } },
      });

      if (existing) {
        await ctx.prisma.$transaction([
          ctx.prisma.portfolioLike.delete({ where: { id: existing.id } }),
          ctx.prisma.portfolioProject.update({
            where: { id: input.projectId },
            data: { likeCount: { decrement: 1 } },
          }),
        ]);
        return { liked: false };
      }

      await ctx.prisma.$transaction([
        ctx.prisma.portfolioLike.create({
          data: { projectId: input.projectId, userId: ctx.userId! },
        }),
        ctx.prisma.portfolioProject.update({
          where: { id: input.projectId },
          data: { likeCount: { increment: 1 } },
        }),
      ]);
      return { liked: true };
    }),

  isLiked: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const like = await ctx.prisma.portfolioLike.findUnique({
        where: { projectId_userId: { projectId: input.projectId, userId: ctx.userId! } },
      });
      return { liked: !!like };
    }),

  // ─── Comments ─────────────────────────────────────────

  addComment: contentMutationProcedure
    .input(
      z.object({
        projectId: z.string(),
        content: z.string().min(2).max(2000),
        parentId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.portfolioProject.findUnique({
        where: { id: input.projectId },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'הפרויקט לא נמצא' });

      return ctx.prisma.portfolioComment.create({
        data: {
          projectId: input.projectId,
          authorId: ctx.userId!,
          content: input.content,
          parentId: input.parentId,
          moderationStatus: 'PENDING',
        },
        include: {
          author: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
        },
      });
    }),
});

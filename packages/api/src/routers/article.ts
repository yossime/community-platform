import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  contentMutationProcedure,
} from '../trpc';

export const articleRouter = createTRPCRouter({
  // ─── Public Queries ──────────────────────────────────

  list: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        categorySlug: z.string().optional(),
        sortBy: z.enum(['newest', 'popular', 'editors_pick']).default('newest'),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const articles = await ctx.prisma.article.findMany({
        where: {
          isPublished: true,
          moderationStatus: 'APPROVED',
          ...(input.categorySlug
            ? { category: { slug: input.categorySlug } }
            : {}),
          ...(input.sortBy === 'editors_pick' ? { isEditorsPick: true } : {}),
          ...(input.search
            ? {
                OR: [
                  { title: { contains: input.search, mode: 'insensitive' as const } },
                  { excerpt: { contains: input.search, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        orderBy:
          input.sortBy === 'popular'
            ? { viewCount: 'desc' }
            : { publishedAt: 'desc' },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          author: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
          category: { select: { id: true, name: true, slug: true } },
        },
      });

      let nextCursor: string | undefined;
      if (articles.length > input.limit) {
        const nextItem = articles.pop();
        nextCursor = nextItem?.id;
      }

      return { articles, nextCursor };
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const article = await ctx.prisma.article.findUnique({
        where: { slug: input.slug },
        include: {
          author: { select: { id: true, displayName: true, slug: true, avatarUrl: true, bio: true } },
          category: true,
          comments: {
            where: { moderationStatus: 'APPROVED', parentId: null },
            orderBy: { createdAt: 'asc' },
            include: {
              author: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
              children: {
                where: { moderationStatus: 'APPROVED' },
                orderBy: { createdAt: 'asc' },
                include: { author: { select: { id: true, displayName: true, slug: true, avatarUrl: true } } },
              },
            },
          },
        },
      });

      if (!article) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'המאמר לא נמצא' });
      }

      // Increment view count
      await ctx.prisma.article.update({
        where: { id: article.id },
        data: { viewCount: { increment: 1 } },
      });

      return article;
    }),

  getCategories: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.articleCategory.findMany({
      orderBy: { displayOrder: 'asc' },
      include: { _count: { select: { articles: true } } },
    });
  }),

  editorsPicks: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(6) }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.article.findMany({
        where: { isPublished: true, isEditorsPick: true, moderationStatus: 'APPROVED' },
        orderBy: { publishedAt: 'desc' },
        take: input.limit,
        include: {
          author: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
          category: { select: { id: true, name: true, slug: true } },
        },
      });
    }),

  // ─── Article Mutations ───────────────────────────────

  create: contentMutationProcedure
    .input(
      z.object({
        categoryId: z.string(),
        title: z.string().min(5).max(200),
        content: z.string().min(100),
        excerpt: z.string().min(10).max(300),
        coverImageUrl: z.string().url().optional(),
        metaTitle: z.string().max(60).optional(),
        metaDescription: z.string().max(160).optional(),
        publishNow: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slug =
        input.title
          .toLowerCase()
          .replace(/[^a-z0-9\u0590-\u05FF]+/g, '-')
          .replace(/(^-|-$)/g, '')
          .slice(0, 100) +
        '-' +
        Date.now().toString(36);

      return ctx.prisma.article.create({
        data: {
          authorId: ctx.userId!,
          categoryId: input.categoryId,
          title: input.title,
          content: input.content,
          excerpt: input.excerpt,
          coverImageUrl: input.coverImageUrl ?? null,
          metaTitle: input.metaTitle ?? null,
          metaDescription: input.metaDescription ?? null,
          slug,
          isPublished: input.publishNow,
          publishedAt: input.publishNow ? new Date() : null,
          moderationStatus: 'PENDING',
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(5).max(200).optional(),
        content: z.string().min(100).optional(),
        excerpt: z.string().min(10).max(300).optional(),
        categoryId: z.string().optional(),
        coverImageUrl: z.string().url().optional(),
        metaTitle: z.string().max(60).optional(),
        metaDescription: z.string().max(160).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const article = await ctx.prisma.article.findUnique({ where: { id: input.id } });
      if (!article) throw new TRPCError({ code: 'NOT_FOUND', message: 'המאמר לא נמצא' });
      if (article.authorId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה לערוך מאמר זה' });
      }

      const { id, ...data } = input;
      return ctx.prisma.article.update({ where: { id }, data });
    }),

  publish: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const article = await ctx.prisma.article.findUnique({ where: { id: input.id } });
      if (!article) throw new TRPCError({ code: 'NOT_FOUND', message: 'המאמר לא נמצא' });
      if (article.authorId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה לפרסם מאמר זה' });
      }

      return ctx.prisma.article.update({
        where: { id: input.id },
        data: {
          isPublished: true,
          publishedAt: article.publishedAt ?? new Date(),
          moderationStatus: 'PENDING',
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const article = await ctx.prisma.article.findUnique({ where: { id: input.id } });
      if (!article) throw new TRPCError({ code: 'NOT_FOUND', message: 'המאמר לא נמצא' });
      if (article.authorId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה למחוק מאמר זה' });
      }

      return ctx.prisma.article.update({
        where: { id: input.id },
        data: { isPublished: false, moderationStatus: 'REMOVED' },
      });
    }),

  myArticles: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const articles = await ctx.prisma.article.findMany({
        where: { authorId: ctx.userId!, moderationStatus: { not: 'REMOVED' } },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
      });

      let nextCursor: string | undefined;
      if (articles.length > input.limit) {
        const nextItem = articles.pop();
        nextCursor = nextItem?.id;
      }

      return { articles, nextCursor };
    }),

  // ─── Comments ────────────────────────────────────────

  addComment: contentMutationProcedure
    .input(
      z.object({
        articleId: z.string(),
        content: z.string().min(2).max(2000),
        parentId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const article = await ctx.prisma.article.findUnique({ where: { id: input.articleId } });
      if (!article) throw new TRPCError({ code: 'NOT_FOUND', message: 'המאמר לא נמצא' });

      if (input.parentId) {
        const parent = await ctx.prisma.articleComment.findUnique({ where: { id: input.parentId } });
        if (!parent) throw new TRPCError({ code: 'NOT_FOUND', message: 'התגובה לא נמצאה' });
      }

      const [comment] = await ctx.prisma.$transaction([
        ctx.prisma.articleComment.create({
          data: {
            articleId: input.articleId,
            authorId: ctx.userId!,
            content: input.content,
            parentId: input.parentId,
            moderationStatus: 'PENDING',
          },
          include: {
            author: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
          },
        }),
        ctx.prisma.article.update({
          where: { id: input.articleId },
          data: { commentCount: { increment: 1 } },
        }),
      ]);

      return comment;
    }),

  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.prisma.articleComment.findUnique({ where: { id: input.commentId } });
      if (!comment) throw new TRPCError({ code: 'NOT_FOUND', message: 'התגובה לא נמצאה' });
      if (comment.authorId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה למחוק תגובה זו' });
      }

      await ctx.prisma.$transaction([
        ctx.prisma.articleComment.delete({ where: { id: input.commentId } }),
        ctx.prisma.article.update({
          where: { id: comment.articleId },
          data: { commentCount: { decrement: 1 } },
        }),
      ]);

      return { success: true };
    }),

  // ─── Likes ───────────────────────────────────────────

  toggleLike: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Use a tag relation for article likes (polymorphic)
      const existingLike = await ctx.prisma.tagRelation.findFirst({
        where: {
          entityType: 'article_like',
          entityId: input.articleId,
          tag: { slug: `user-${ctx.userId!}` },
        },
      });

      if (existingLike) {
        // Unlike
        await ctx.prisma.$transaction([
          ctx.prisma.tagRelation.delete({ where: { id: existingLike.id } }),
          ctx.prisma.article.update({
            where: { id: input.articleId },
            data: { likeCount: { decrement: 1 } },
          }),
        ]);
        return { liked: false };
      }

      // Like - ensure tag exists
      let userTag = await ctx.prisma.tag.findUnique({ where: { slug: `user-${ctx.userId!}` } });
      if (!userTag) {
        userTag = await ctx.prisma.tag.create({
          data: { name: `user-${ctx.userId!}`, slug: `user-${ctx.userId!}`, category: 'system' },
        });
      }

      await ctx.prisma.$transaction([
        ctx.prisma.tagRelation.create({
          data: { tagId: userTag.id, entityType: 'article_like', entityId: input.articleId },
        }),
        ctx.prisma.article.update({
          where: { id: input.articleId },
          data: { likeCount: { increment: 1 } },
        }),
      ]);

      return { liked: true };
    }),

  isLiked: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const like = await ctx.prisma.tagRelation.findFirst({
        where: {
          entityType: 'article_like',
          entityId: input.articleId,
          tag: { slug: `user-${ctx.userId!}` },
        },
      });
      return { liked: !!like };
    }),
});

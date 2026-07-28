import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { adminProcedure, createTRPCRouter, moderatorProcedure } from '../trpc';

const ENTITY_MODELS = ['Thread', 'Post', 'Project', 'ClassifiedListing', 'Article', 'Course'] as const;

export const adminRouter = createTRPCRouter({
  getModerationQueue: moderatorProcedure
    .input(
      z.object({
        entityType: z.enum(ENTITY_MODELS).optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const type = input.entityType ?? 'Thread';

      // Query pending content based on entity type
      if (type === 'Thread') {
        const threads = await ctx.prisma.thread.findMany({
          where: { moderationStatus: 'PENDING' },
          orderBy: { createdAt: 'asc' },
          take: input.limit,
          cursor: input.cursor ? { id: input.cursor } : undefined,
          include: {
            author: { select: { id: true, displayName: true, slug: true } },
          },
        });
        return { items: threads, type: 'Thread' as const };
      }

      if (type === 'Post') {
        const posts = await ctx.prisma.post.findMany({
          where: { moderationStatus: 'PENDING' },
          orderBy: { createdAt: 'asc' },
          take: input.limit,
          cursor: input.cursor ? { id: input.cursor } : undefined,
          include: {
            author: { select: { id: true, displayName: true, slug: true } },
          },
        });
        return { items: posts, type: 'Post' as const };
      }

      if (type === 'Project') {
        const projects = await ctx.prisma.project.findMany({
          where: { moderationStatus: 'PENDING' },
          orderBy: { createdAt: 'asc' },
          take: input.limit,
          cursor: input.cursor ? { id: input.cursor } : undefined,
          include: {
            client: { select: { id: true, displayName: true, slug: true } },
          },
        });
        return { items: projects, type: 'Project' as const };
      }

      return { items: [], type };
    }),

  moderateContent: moderatorProcedure
    .input(
      z.object({
        entityType: z.string(),
        entityId: z.string(),
        action: z.enum(['APPROVE', 'REJECT', 'FLAG']),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const newStatus = input.action === 'APPROVE' ? 'APPROVED'
        : input.action === 'REJECT' ? 'REJECTED'
        : 'FLAGGED';

      // Update entity status based on type
      try {
        if (input.entityType === 'Thread') {
          await ctx.prisma.thread.update({
            where: { id: input.entityId },
            data: { moderationStatus: newStatus as 'APPROVED' | 'REJECTED' | 'FLAGGED' },
          });
        } else if (input.entityType === 'Post') {
          await ctx.prisma.post.update({
            where: { id: input.entityId },
            data: { moderationStatus: newStatus as 'APPROVED' | 'REJECTED' | 'FLAGGED' },
          });
        } else if (input.entityType === 'Project') {
          await ctx.prisma.project.update({
            where: { id: input.entityId },
            data: { moderationStatus: newStatus as 'APPROVED' | 'REJECTED' | 'FLAGGED' },
          });
        }
      } catch {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'התוכן לא נמצא' });
      }

      // Log moderation action
      await ctx.prisma.moderationLog.create({
        data: {
          moderatorId: ctx.userId!,
          entityType: input.entityType,
          entityId: input.entityId,
          action: input.action,
          reason: input.reason,
          newStatus: newStatus as 'APPROVED' | 'REJECTED' | 'FLAGGED',
          isAutomatic: false,
        },
      });

      return { success: true };
    }),

  listUsers: adminProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'DEACTIVATED']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const users = await ctx.prisma.user.findMany({
        where: input.status ? { status: input.status } : {},
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: { membership: true, reputation: true },
      });

      let nextCursor: string | undefined;
      if (users.length > input.limit) {
        const nextItem = users.pop();
        nextCursor = nextItem?.id;
      }

      return { users, nextCursor };
    }),

  updateUserStatus: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'DEACTIVATED']),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { status: input.status },
      });

      return user;
    }),

  getStats: moderatorProcedure.query(async ({ ctx }) => {
    const [userCount, pendingThreads, pendingPosts] = await Promise.all([
      ctx.prisma.user.count(),
      ctx.prisma.thread.count({ where: { moderationStatus: 'PENDING' } }),
      ctx.prisma.post.count({ where: { moderationStatus: 'PENDING' } }),
    ]);

    return {
      userCount,
      pendingThreads,
      pendingPosts,
      pendingTotal: pendingThreads + pendingPosts,
    };
  }),
});

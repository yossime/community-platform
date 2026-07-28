import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { createTRPCRouter, protectedProcedure, contentMutationProcedure } from '../trpc';

export const messageRouter = createTRPCRouter({
  // ─── Conversations ───────────────────────────────────

  listConversations: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.conversationParticipant.findMany({
      where: { userId: ctx.userId! },
      orderBy: { conversation: { updatedAt: 'desc' } },
      include: {
        conversation: {
          include: {
            participants: {
              include: { user: { select: { id: true, displayName: true, slug: true, avatarUrl: true } } },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
  }),

  startConversation: protectedProcedure
    .input(
      z.object({
        recipientId: z.string(),
        message: z.string().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.recipientId === ctx.userId!) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'לא ניתן לשלוח הודעה לעצמך' });
      }

      // Check if conversation already exists between these users
      const existing = await ctx.prisma.conversation.findFirst({
        where: {
          type: 'DIRECT',
          AND: [
            { participants: { some: { userId: ctx.userId! } } },
            { participants: { some: { userId: input.recipientId } } },
          ],
        },
      });

      if (existing) {
        // Send message in existing conversation
        const message = await ctx.prisma.message.create({
          data: {
            conversationId: existing.id,
            senderId: ctx.userId!,
            content: input.message,
          },
        });

        await ctx.prisma.$transaction([
          ctx.prisma.conversation.update({
            where: { id: existing.id },
            data: { updatedAt: new Date() },
          }),
          ctx.prisma.conversationParticipant.updateMany({
            where: { conversationId: existing.id, userId: { not: ctx.userId! } },
            data: { unreadCount: { increment: 1 } },
          }),
        ]);

        return { conversationId: existing.id, messageId: message.id };
      }

      // Create new conversation
      const conversation = await ctx.prisma.conversation.create({
        data: {
          type: 'DIRECT',
          participants: {
            create: [
              { userId: ctx.userId!, isAdmin: true },
              { userId: input.recipientId },
            ],
          },
          messages: {
            create: {
              senderId: ctx.userId!,
              content: input.message,
            },
          },
        },
        include: { messages: { take: 1 } },
      });

      // Set unread for recipient
      await ctx.prisma.conversationParticipant.updateMany({
        where: { conversationId: conversation.id, userId: input.recipientId },
        data: { unreadCount: 1 },
      });

      return { conversationId: conversation.id, messageId: conversation.messages[0]?.id };
    }),

  // ─── Messages ────────────────────────────────────────

  getMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify participant
      const participant = await ctx.prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId: input.conversationId, userId: ctx.userId! } },
      });
      if (!participant) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך גישה לשיחה זו' });
      }

      const messages = await ctx.prisma.message.findMany({
        where: { conversationId: input.conversationId },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          sender: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
          replyTo: {
            select: { id: true, content: true, sender: { select: { displayName: true } } },
          },
        },
      });

      let nextCursor: string | undefined;
      if (messages.length > input.limit) {
        const nextItem = messages.pop();
        nextCursor = nextItem?.id;
      }

      return { messages: messages.reverse(), nextCursor };
    }),

  sendMessage: contentMutationProcedure
    .input(
      z.object({
        conversationId: z.string(),
        content: z.string().min(1).max(5000),
        type: z.enum(['TEXT', 'IMAGE', 'FILE']).default('TEXT'),
        replyToId: z.string().optional(),
        attachmentUrl: z.string().url().optional(),
        attachmentName: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify participant
      const participant = await ctx.prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId: input.conversationId, userId: ctx.userId! } },
      });
      if (!participant) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך גישה לשיחה זו' });
      }

      const message = await ctx.prisma.message.create({
        data: {
          conversationId: input.conversationId,
          senderId: ctx.userId!,
          content: input.content,
          type: input.type,
          replyToId: input.replyToId,
          attachmentUrl: input.attachmentUrl,
          attachmentName: input.attachmentName,
        },
        include: {
          sender: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
        },
      });

      // Update conversation and unread counts
      await ctx.prisma.$transaction([
        ctx.prisma.conversation.update({
          where: { id: input.conversationId },
          data: { updatedAt: new Date() },
        }),
        ctx.prisma.conversationParticipant.updateMany({
          where: { conversationId: input.conversationId, userId: { not: ctx.userId! } },
          data: { unreadCount: { increment: 1 } },
        }),
      ]);

      return message;
    }),

  markRead: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId: input.conversationId, userId: ctx.userId! } },
        data: { unreadCount: 0, lastReadAt: new Date() },
      });
      return { success: true };
    }),

  // ─── Unread Count ────────────────────────────────────

  totalUnread: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.prisma.conversationParticipant.aggregate({
      where: { userId: ctx.userId! },
      _sum: { unreadCount: true },
    });
    return { count: result._sum.unreadCount ?? 0 };
  }),
});

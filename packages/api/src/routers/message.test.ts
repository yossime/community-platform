import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

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
      conversation: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      conversationParticipant: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        aggregate: vi.fn(),
      },
      message: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn((arr: unknown[]) => Promise.all(arr)),
    } as unknown as Context['prisma'],
    supabase: {} as unknown as Context['supabase'],
    userId: undefined,
    userRole: undefined,
    clientIp: '127.0.0.1',
    ...overrides,
  };
}

describe('Message Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listConversations', () => {
    it('returns conversations for authenticated user', async () => {
      const mockConversations = [
        { conversation: { id: 'c1', participants: [], messages: [] } },
      ];

      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.conversationParticipant.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValue(mockConversations);

      const caller = createCaller(ctx);
      const result = await caller.message.listConversations();

      expect(result).toEqual(mockConversations);
    });

    it('rejects unauthenticated access', async () => {
      const ctx = createMockContext({ userId: undefined });
      const caller = createCaller(ctx);
      await expect(caller.message.listConversations()).rejects.toThrow(TRPCError);
    });
  });

  describe('startConversation', () => {
    it('prevents sending message to self', async () => {
      const ctx = createMockContext({ userId: 'user-1' });
      const caller = createCaller(ctx);

      await expect(
        caller.message.startConversation({
          recipientId: 'user-1',
          message: 'Hello myself',
        })
      ).rejects.toThrow(TRPCError);
    });

    it('sends to existing conversation if one exists', async () => {
      const existingConversation = { id: 'c1' };
      const newMessage = { id: 'm1' };

      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.conversation.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValue(existingConversation);
      (ctx.prisma.message.create as ReturnType<typeof vi.fn>)
        .mockResolvedValue(newMessage);
      (ctx.prisma.conversation.update as ReturnType<typeof vi.fn>)
        .mockResolvedValue({});
      (ctx.prisma.conversationParticipant.updateMany as ReturnType<typeof vi.fn>)
        .mockResolvedValue({});

      const caller = createCaller(ctx);
      const result = await caller.message.startConversation({
        recipientId: 'user-2',
        message: 'Hello!',
      });

      expect(result.conversationId).toBe('c1');
      expect(ctx.prisma.message.create).toHaveBeenCalled();
    });

    it('creates new conversation if none exists', async () => {
      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.conversation.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValue(null);
      (ctx.prisma.conversation.create as ReturnType<typeof vi.fn>)
        .mockResolvedValue({ id: 'c-new', messages: [{ id: 'm-new' }] });
      (ctx.prisma.conversationParticipant.updateMany as ReturnType<typeof vi.fn>)
        .mockResolvedValue({});

      const caller = createCaller(ctx);
      const result = await caller.message.startConversation({
        recipientId: 'user-2',
        message: 'First message!',
      });

      expect(result.conversationId).toBe('c-new');
      expect(ctx.prisma.conversation.create).toHaveBeenCalled();
    });
  });

  describe('getMessages', () => {
    it('rejects non-participants', async () => {
      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.conversationParticipant.findUnique as ReturnType<typeof vi.fn>)
        .mockResolvedValue(null);

      const caller = createCaller(ctx);
      await expect(
        caller.message.getMessages({ conversationId: 'c1' })
      ).rejects.toThrow(TRPCError);
    });

    it('returns messages for participants', async () => {
      const mockMessages = [
        { id: 'm1', content: 'Hello', sender: { displayName: 'User1' } },
        { id: 'm2', content: 'Hi there', sender: { displayName: 'User2' } },
      ];

      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.conversationParticipant.findUnique as ReturnType<typeof vi.fn>)
        .mockResolvedValue({ userId: 'user-1' });
      (ctx.prisma.message.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValue(mockMessages);

      const caller = createCaller(ctx);
      const result = await caller.message.getMessages({ conversationId: 'c1' });

      expect(result.messages).toHaveLength(2);
    });
  });

  describe('markRead', () => {
    it('resets unread count to 0', async () => {
      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.conversationParticipant.update as ReturnType<typeof vi.fn>)
        .mockResolvedValue({});

      const caller = createCaller(ctx);
      const result = await caller.message.markRead({ conversationId: 'c1' });

      expect(result).toEqual({ success: true });
      expect(ctx.prisma.conversationParticipant.update).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: 'c1', userId: 'user-1' } },
        data: { unreadCount: 0, lastReadAt: expect.any(Date) },
      });
    });
  });

  describe('totalUnread', () => {
    it('returns total unread count across all conversations', async () => {
      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.conversationParticipant.aggregate as ReturnType<typeof vi.fn>)
        .mockResolvedValue({ _sum: { unreadCount: 12 } });

      const caller = createCaller(ctx);
      const result = await caller.message.totalUnread();

      expect(result).toEqual({ count: 12 });
    });

    it('returns 0 when no unread messages', async () => {
      const ctx = createMockContext({ userId: 'user-1' });
      (ctx.prisma.conversationParticipant.aggregate as ReturnType<typeof vi.fn>)
        .mockResolvedValue({ _sum: { unreadCount: null } });

      const caller = createCaller(ctx);
      const result = await caller.message.totalUnread();

      expect(result).toEqual({ count: 0 });
    });
  });
});

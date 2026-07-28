'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';

import { useAuth } from './useAuth';

let globalSocket: Socket | null = null;

export function useSocket(): { socket: Socket | null; isConnected: boolean } {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);

  const displayName = user?.user_metadata?.display_name as string | undefined;

  useEffect(() => {
    if (!user?.id) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

    if (!globalSocket) {
      globalSocket = io(wsUrl, {
        auth: {
          userId: user.id,
          displayName: displayName ?? '',
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
      });
    }

    const socket = globalSocket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    if (socket.connected) setIsConnected(true);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
    };
  }, [user?.id, displayName]);

  return { socket: globalSocket, isConnected };
}

export function useConversationSocket(conversationId: string | null) {
  const { socket, isConnected } = useSocket();
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!socket || !conversationId) return;

    socket.emit('conversation:join', conversationId);

    const handleTyping = (data: {
      conversationId: string;
      userId: string;
      displayName?: string;
      isTyping: boolean;
    }) => {
      if (data.conversationId !== conversationId) return;

      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (data.isTyping) {
          next.set(data.userId, data.displayName ?? '');
        } else {
          next.delete(data.userId);
        }
        return next;
      });
    };

    socket.on('typing:update', handleTyping);

    return () => {
      socket.emit('conversation:leave', conversationId);
      socket.off('typing:update', handleTyping);
      setTypingUsers(new Map());
    };
  }, [socket, conversationId]);

  const startTyping = useCallback(() => {
    if (socket && conversationId) {
      socket.emit('typing:start', { conversationId });
    }
  }, [socket, conversationId]);

  const stopTyping = useCallback(() => {
    if (socket && conversationId) {
      socket.emit('typing:stop', { conversationId });
    }
  }, [socket, conversationId]);

  const emitNewMessage = useCallback(
    (data: { messageId: string; content: string; type: string; createdAt: string }) => {
      if (socket && conversationId) {
        socket.emit('message:new', { ...data, conversationId });
      }
    },
    [socket, conversationId],
  );

  const emitRead = useCallback(
    (messageId: string) => {
      if (socket && conversationId) {
        socket.emit('message:read', { conversationId, messageId });
      }
    },
    [socket, conversationId],
  );

  return {
    isConnected,
    typingUsers,
    startTyping,
    stopTyping,
    emitNewMessage,
    emitRead,
  };
}

export function useOnlineStatus(userIds: string[]) {
  const { socket } = useSocket();
  const [onlineStatus, setOnlineStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!socket || userIds.length === 0) return;

    // Get initial status
    socket.emit('users:getOnline', userIds, (result: Record<string, boolean>) => {
      setOnlineStatus(result);
    });

    // Listen for status changes
    const handleOnline = (data: { userId: string; online: boolean }) => {
      if (userIds.includes(data.userId)) {
        setOnlineStatus((prev) => ({ ...prev, [data.userId]: data.online }));
      }
    };

    socket.on('user:online', handleOnline);
    return () => {
      socket.off('user:online', handleOnline);
    };
  }, [socket, userIds.join(',')]);

  return onlineStatus;
}

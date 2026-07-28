import { Server, type Socket } from 'socket.io';
import { createServer } from 'http';
const PORT = parseInt(process.env.PORT ?? process.env.WS_PORT ?? '3002', 10);

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('OK');
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
});

// ─── Types ─────────────────────────────────────────────

interface UserSocket extends Socket {
  userId?: string;
  displayName?: string;
}

// Online users: userId → Set of socketIds
const onlineUsers = new Map<string, Set<string>>();
// Typing indicators: conversationId → Set of userIds
const typingUsers = new Map<string, Set<string>>();

// ─── Auth Middleware ────────────────────────────────────

io.use((socket: UserSocket, next) => {
  const userId = socket.handshake.auth.userId as string | undefined;
  const displayName = socket.handshake.auth.displayName as string | undefined;

  if (!userId) {
    return next(new Error('Authentication required'));
  }

  socket.userId = userId;
  socket.displayName = displayName;
  next();
});

// ─── Connection Handler ────────────────────────────────

io.on('connection', (socket: UserSocket) => {
  const userId = socket.userId!;
  console.log(`User connected: ${userId}`);

  // Track online status
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId)!.add(socket.id);

  // Broadcast online status
  io.emit('user:online', { userId, online: true });

  // ─── Join Conversations ──────────────────────────────

  socket.on('conversation:join', (conversationId: string) => {
    socket.join(`conversation:${conversationId}`);
  });

  socket.on('conversation:leave', (conversationId: string) => {
    socket.leave(`conversation:${conversationId}`);
  });

  // ─── Typing Indicators ──────────────────────────────

  socket.on('typing:start', (data: { conversationId: string }) => {
    if (!typingUsers.has(data.conversationId)) {
      typingUsers.set(data.conversationId, new Set());
    }
    typingUsers.get(data.conversationId)!.add(userId);

    socket.to(`conversation:${data.conversationId}`).emit('typing:update', {
      conversationId: data.conversationId,
      userId,
      displayName: socket.displayName,
      isTyping: true,
    });
  });

  socket.on('typing:stop', (data: { conversationId: string }) => {
    typingUsers.get(data.conversationId)?.delete(userId);

    socket.to(`conversation:${data.conversationId}`).emit('typing:update', {
      conversationId: data.conversationId,
      userId,
      displayName: socket.displayName,
      isTyping: false,
    });
  });

  // ─── New Message ─────────────────────────────────────

  socket.on(
    'message:new',
    (data: {
      conversationId: string;
      messageId: string;
      content: string;
      type: string;
      createdAt: string;
    }) => {
      // Broadcast to all participants in the conversation
      socket.to(`conversation:${data.conversationId}`).emit('message:received', {
        ...data,
        senderId: userId,
        senderName: socket.displayName,
      });

      // Clear typing for this user
      typingUsers.get(data.conversationId)?.delete(userId);
      socket.to(`conversation:${data.conversationId}`).emit('typing:update', {
        conversationId: data.conversationId,
        userId,
        isTyping: false,
      });
    },
  );

  // ─── Message Read ────────────────────────────────────

  socket.on('message:read', (data: { conversationId: string; messageId: string }) => {
    socket.to(`conversation:${data.conversationId}`).emit('message:read', {
      conversationId: data.conversationId,
      userId,
      messageId: data.messageId,
    });
  });

  // ─── Get Online Users ────────────────────────────────

  socket.on('users:getOnline', (userIds: string[], callback: (result: Record<string, boolean>) => void) => {
    const result: Record<string, boolean> = {};
    for (const id of userIds) {
      result[id] = onlineUsers.has(id) && onlineUsers.get(id)!.size > 0;
    }
    callback(result);
  });

  // ─── Disconnect ──────────────────────────────────────

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${userId}`);

    const userSockets = onlineUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        onlineUsers.delete(userId);
        io.emit('user:online', { userId, online: false });
      }
    }

    // Clean typing indicators
    for (const [convId, users] of typingUsers) {
      if (users.has(userId)) {
        users.delete(userId);
        io.to(`conversation:${convId}`).emit('typing:update', {
          conversationId: convId,
          userId,
          isTyping: false,
        });
      }
    }
  });
});

// ─── Start Server ──────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});

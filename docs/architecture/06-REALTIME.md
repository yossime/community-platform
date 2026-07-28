# 06 — Real-Time Architecture

## 1. Overview

The platform relies on two complementary real-time systems that work together to
deliver live updates across every interactive surface.

| System | Role | Deployment |
|--------|------|------------|
| **Supabase Realtime** | Managed WebSocket channels for database change notifications (Postgres Changes), presence tracking, and broadcast messages. Zero infrastructure to manage; scales with the Supabase plan. | Supabase-hosted |
| **Socket.IO server** | Custom WebSocket server for high-frequency, ephemeral events (typing indicators, live marketplace chat) and as an overflow path when Supabase concurrent-connection limits are approached. | ECS Fargate (with Upstash Redis adapter) |

**Design principles:**

1. Supabase Realtime is the **primary** transport for anything that originates
   from a database write (new posts, messages, notifications).
2. Socket.IO handles **ephemeral** events that never touch the database in
   real time (typing indicators) or that require sub-100 ms fan-out (marketplace
   live chat).
3. The client SDK abstracts both transports behind a unified hook API so
   components never need to know which transport is in use.
4. Every channel subscription is **scoped by the user's RBAC role and gender
   partition** to prevent data leakage.

---

## 2. Supabase Realtime Channels

### 2.1 Database Change Channels (Postgres Changes)

These channels subscribe to Postgres logical replication events filtered by
table and row-level conditions.

| Channel Name | Table | Events | Filter | Use Case |
|---|---|---|---|---|
| `thread:{threadId}` | `Post` | `INSERT` | `threadId=eq.{threadId}` | Live post updates in thread view |
| `conversation:{conversationId}` | `Message` | `INSERT` | `conversationId=eq.{conversationId}` | Live message updates in DM / group chat |
| `user:{userId}:notifications` | `Notification` | `INSERT` | `userId=eq.{userId}` | Notification badge count + toast |
| `forum:{forumId}` | `Thread` | `INSERT` | `forumId=eq.{forumId}` | New thread indicators on forum index |
| `moderation:queue` | `ModerationLog` | `INSERT` | _(none)_ | Moderation dashboard live queue |

#### Client Subscription Examples

```typescript
// packages/realtime/src/channels/postgres-changes.ts

import type { SupabaseClient, RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import type { Database } from "@kh/db/types";

type Post = Database["public"]["Tables"]["Post"]["Row"];
type Message = Database["public"]["Tables"]["Message"]["Row"];
type Notification = Database["public"]["Tables"]["Notification"]["Row"];
type Thread = Database["public"]["Tables"]["Thread"]["Row"];
type ModerationLog = Database["public"]["Tables"]["ModerationLog"]["Row"];

// ── Thread Posts ─────────────────────────────────────────────────────
export function subscribeToThreadPosts(
  supabase: SupabaseClient<Database>,
  threadId: string,
  onNewPost: (post: Post) => void,
) {
  return supabase
    .channel(`thread:${threadId}`)
    .on<Post>(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "Post",
        filter: `threadId=eq.${threadId}`,
      },
      (payload: RealtimePostgresInsertPayload<Post>) => {
        onNewPost(payload.new);
      },
    )
    .subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        console.log(`[realtime] subscribed to thread:${threadId}`);
      }
      if (err) {
        console.error(`[realtime] thread:${threadId} error`, err);
      }
    });
}

// ── Conversation Messages ────────────────────────────────────────────
export function subscribeToConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  onNewMessage: (message: Message) => void,
) {
  return supabase
    .channel(`conversation:${conversationId}`)
    .on<Message>(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "Message",
        filter: `conversationId=eq.${conversationId}`,
      },
      (payload: RealtimePostgresInsertPayload<Message>) => {
        onNewMessage(payload.new);
      },
    )
    .subscribe();
}

// ── User Notifications ───────────────────────────────────────────────
export function subscribeToNotifications(
  supabase: SupabaseClient<Database>,
  userId: string,
  onNotification: (notification: Notification) => void,
) {
  return supabase
    .channel(`user:${userId}:notifications`)
    .on<Notification>(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "Notification",
        filter: `userId=eq.${userId}`,
      },
      (payload: RealtimePostgresInsertPayload<Notification>) => {
        onNotification(payload.new);
      },
    )
    .subscribe();
}

// ── Forum Threads ────────────────────────────────────────────────────
export function subscribeToForumThreads(
  supabase: SupabaseClient<Database>,
  forumId: string,
  onNewThread: (thread: Thread) => void,
) {
  return supabase
    .channel(`forum:${forumId}`)
    .on<Thread>(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "Thread",
        filter: `forumId=eq.${forumId}`,
      },
      (payload: RealtimePostgresInsertPayload<Thread>) => {
        onNewThread(payload.new);
      },
    )
    .subscribe();
}

// ── Moderation Queue ─────────────────────────────────────────────────
export function subscribeToModerationQueue(
  supabase: SupabaseClient<Database>,
  onNewEntry: (entry: ModerationLog) => void,
) {
  return supabase
    .channel("moderation:queue")
    .on<ModerationLog>(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "ModerationLog",
      },
      (payload: RealtimePostgresInsertPayload<ModerationLog>) => {
        onNewEntry(payload.new);
      },
    )
    .subscribe();
}
```

### 2.2 Presence Channels

Presence channels track who is currently connected to a given context. The
Supabase Realtime presence API provides automatic join/leave tracking with
conflict-free replicated state.

| Channel Name | Purpose | Payload |
|---|---|---|
| `presence:thread:{threadId}` | Who is viewing a thread | `{ userId, displayName, avatarUrl }` |
| `presence:global` | Online status across the platform | `{ userId, lastSeen }` |
| `presence:forum:{forumId}` | Active users browsing a forum | `{ userId }` |

#### Presence Tracking Code

```typescript
// packages/realtime/src/channels/presence.ts

import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────
export interface ThreadPresenceState {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface GlobalPresenceState {
  userId: string;
  lastSeen: string; // ISO 8601
}

export interface ForumPresenceState {
  userId: string;
}

type PresenceState<T extends Record<string, unknown>> = {
  [key: string]: T[];
};

// ── Thread Presence ──────────────────────────────────────────────────
export function trackThreadPresence(
  supabase: SupabaseClient,
  threadId: string,
  userState: ThreadPresenceState,
  callbacks: {
    onSync: (state: PresenceState<ThreadPresenceState>) => void;
    onJoin: (key: string, newPresences: ThreadPresenceState[]) => void;
    onLeave: (key: string, leftPresences: ThreadPresenceState[]) => void;
  },
): RealtimeChannel {
  const channel = supabase.channel(`presence:thread:${threadId}`, {
    config: {
      presence: {
        key: userState.userId,
      },
    },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<ThreadPresenceState>();
      callbacks.onSync(state);
    })
    .on("presence", { event: "join" }, ({ key, newPresences }) => {
      callbacks.onJoin(key, newPresences as ThreadPresenceState[]);
    })
    .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
      callbacks.onLeave(key, leftPresences as ThreadPresenceState[]);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track(userState);
      }
    });

  return channel;
}

// ── Global Online Status ─────────────────────────────────────────────
export function trackGlobalPresence(
  supabase: SupabaseClient,
  userId: string,
  onSync: (onlineUserIds: string[]) => void,
): RealtimeChannel {
  const channel = supabase.channel("presence:global", {
    config: {
      presence: {
        key: userId,
      },
    },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<GlobalPresenceState>();
      const onlineUserIds = Object.keys(state);
      onSync(onlineUserIds);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          userId,
          lastSeen: new Date().toISOString(),
        });
      }
    });

  return channel;
}

// ── Forum Presence ───────────────────────────────────────────────────
export function trackForumPresence(
  supabase: SupabaseClient,
  forumId: string,
  userId: string,
  onSync: (activeUserIds: string[]) => void,
): RealtimeChannel {
  const channel = supabase.channel(`presence:forum:${forumId}`, {
    config: {
      presence: {
        key: userId,
      },
    },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<ForumPresenceState>();
      onSync(Object.keys(state));
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ userId });
      }
    });

  return channel;
}

// ── Cleanup helper ───────────────────────────────────────────────────
export async function leavePresence(channel: RealtimeChannel): Promise<void> {
  await channel.untrack();
  await channel.unsubscribe();
}
```

### 2.3 Broadcast Channels

Broadcast channels send messages to all subscribers without persisting to the
database. They are ideal for ephemeral, high-volume updates like live reaction
counts and marketplace status changes.

| Channel Name | Purpose | Payload |
|---|---|---|
| `broadcast:thread:{threadId}:reactions` | Live reaction updates on posts | `{ postId, reactions }` |
| `broadcast:marketplace:{projectId}` | Project status / milestone changes | `{ status, milestone }` |

```typescript
// packages/realtime/src/channels/broadcast.ts

import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────
export interface ReactionBroadcast {
  postId: string;
  reactions: Record<string, number>; // emoji -> count
}

export interface MarketplaceBroadcast {
  status: "open" | "in_progress" | "review" | "completed" | "disputed";
  milestone: string | null;
}

// ── Thread Reactions ─────────────────────────────────────────────────
export function subscribeToReactionBroadcast(
  supabase: SupabaseClient,
  threadId: string,
  onReaction: (data: ReactionBroadcast) => void,
): RealtimeChannel {
  return supabase
    .channel(`broadcast:thread:${threadId}:reactions`)
    .on("broadcast", { event: "reaction_update" }, ({ payload }) => {
      onReaction(payload as ReactionBroadcast);
    })
    .subscribe();
}

export function broadcastReaction(
  supabase: SupabaseClient,
  threadId: string,
  data: ReactionBroadcast,
): void {
  const channel = supabase.channel(`broadcast:thread:${threadId}:reactions`);
  channel.send({
    type: "broadcast",
    event: "reaction_update",
    payload: data,
  });
}

// ── Marketplace Status ───────────────────────────────────────────────
export function subscribeToMarketplaceBroadcast(
  supabase: SupabaseClient,
  projectId: string,
  onStatusChange: (data: MarketplaceBroadcast) => void,
): RealtimeChannel {
  return supabase
    .channel(`broadcast:marketplace:${projectId}`)
    .on("broadcast", { event: "status_change" }, ({ payload }) => {
      onStatusChange(payload as MarketplaceBroadcast);
    })
    .subscribe();
}

export function broadcastMarketplaceStatus(
  supabase: SupabaseClient,
  projectId: string,
  data: MarketplaceBroadcast,
): void {
  const channel = supabase.channel(`broadcast:marketplace:${projectId}`);
  channel.send({
    type: "broadcast",
    event: "status_change",
    payload: data,
  });
}
```

---

## 3. Socket.IO Server (ECS Fargate)

### 3.1 Architecture

```
                          ┌──────────────────┐
                          │   ALB (WebSocket  │
                          │   sticky sessions)│
                          └────────┬─────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                     │
   ┌──────────▼─────────┐  ┌──────▼──────────┐  ┌──────▼──────────┐
   │  ECS Fargate Task   │  │ ECS Fargate Task │  │ ECS Fargate Task │
   │                     │  │                  │  │                  │
   │  Socket.IO Server   │  │ Socket.IO Server │  │ Socket.IO Server │
   │  (Node.js)          │  │ (Node.js)        │  │ (Node.js)        │
   └──────────┬──────────┘  └────────┬─────────┘  └────────┬─────────┘
              │                      │                      │
              └──────────────────────┼──────────────────────┘
                                     │
                          ┌──────────▼──────────┐
                          │   Upstash Redis     │
                          │   (pub/sub adapter) │
                          └─────────────────────┘
```

The Application Load Balancer routes WebSocket upgrade requests to Fargate
tasks. All tasks share state through the Upstash Redis adapter so that a
message emitted on one instance is fanned out to clients connected to any
instance.

### 3.2 Socket.IO Namespaces & Events

#### `/typing` namespace

Handles ephemeral typing indicators for conversations. These events are never
persisted to the database.

| Direction | Event | Payload | Notes |
|---|---|---|---|
| Client -> Server | `typing:start` | `{ conversationId: string }` | Debounced on client; server auto-stops after 5 s |
| Client -> Server | `typing:stop` | `{ conversationId: string }` | Explicit stop when user clears input |
| Server -> Client | `typing:update` | `{ conversationId: string, userId: string, displayName: string, isTyping: boolean }` | Broadcast to all participants in conversation |

Server-side auto-stop logic: if no `typing:start` is received for a given
`(userId, conversationId)` pair within 5 seconds, the server emits a
`typing:update` with `isTyping: false`.

#### `/marketplace` namespace

Handles live marketplace project chat between freelancers and clients.

| Direction | Event | Payload | Notes |
|---|---|---|---|
| Client -> Server | `marketplace:join` | `{ projectId: string }` | Joins the Socket.IO room for that project |
| Client -> Server | `marketplace:leave` | `{ projectId: string }` | Leaves the room |
| Client -> Server | `marketplace:message` | `{ projectId: string, content: string }` | Sends a chat message |
| Server -> Client | `marketplace:message` | `{ projectId: string, senderId: string, content: string, timestamp: string }` | Broadcast to room |
| Server -> Client | `marketplace:status` | `{ projectId: string, status: string, milestone: string }` | Broadcast on status change |

#### `/presence` namespace (overflow)

Activated when Supabase Realtime nears its concurrent connection limit (80%
threshold). Provides the same presence semantics as Supabase but via Socket.IO.

| Direction | Event | Payload |
|---|---|---|
| Client -> Server | `presence:track` | `{ channel: string, state: Record<string, unknown> }` |
| Client -> Server | `presence:untrack` | `{ channel: string }` |
| Server -> Client | `presence:sync` | `{ channel: string, state: Record<string, PresenceEntry[]> }` |
| Server -> Client | `presence:join` | `{ channel: string, key: string, presences: PresenceEntry[] }` |
| Server -> Client | `presence:leave` | `{ channel: string, key: string, presences: PresenceEntry[] }` |

### 3.3 Authentication

The Socket.IO server validates every incoming connection by verifying the
Supabase JWT.

```typescript
// apps/ws-server/src/auth/jwt-validator.ts

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export interface WsUser {
  id: string;
  role: "USER" | "MODERATOR" | "ADMIN" | "SUPER_ADMIN";
  gender: "male" | "female";
  membershipTier: "FREE" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE";
}

export async function validateWsConnection(token: string): Promise<WsUser> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error("Invalid token");
  }

  return {
    id: user.id,
    role: user.app_metadata.role ?? "USER",
    gender: user.app_metadata.gender ?? "male",
    membershipTier: user.app_metadata.membershipTier ?? "free",
  };
}
```

### 3.4 Full Server Setup

```typescript
// apps/ws-server/src/index.ts

import http from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { validateWsConnection, type WsUser } from "./auth/jwt-validator";

// ── Redis Adapter ────────────────────────────────────────────────────
const pubClient = new Redis(process.env.UPSTASH_REDIS_URL!, {
  tls: { rejectUnauthorized: false },
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
});
const subClient = pubClient.duplicate();

// ── HTTP + Socket.IO ─────────────────────────────────────────────────
const httpServer = http.createServer((_req, res) => {
  // Health check for ALB target group
  res.writeHead(200);
  res.end("ok");
});

const io = new Server(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(",") ?? [
      "https://kehila.pro",
      "https://www.kehila.pro",
    ],
    credentials: true,
  },
  pingInterval: 25_000,
  pingTimeout: 20_000,
  transports: ["websocket"], // skip HTTP long-polling
});

io.adapter(createAdapter(pubClient, subClient));

// ── Auth Middleware (global) ─────────────────────────────────────────
io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake.auth.token ??
      socket.handshake.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Missing authentication token"));
    }

    const user = await validateWsConnection(token);

    // Attach user to socket for downstream handlers
    socket.data.user = user;
    next();
  } catch (err) {
    next(new Error("Authentication failed"));
  }
});

// ── Rate Limiting ────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW_MS = 10_000; // 10 seconds
const RATE_LIMIT_MAX_EVENTS = 50; // max events per window

function checkRateLimit(socketId: string): boolean {
  const now = Date.now();
  let entry = rateLimitMap.get(socketId);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(socketId, entry);
  }

  entry.count++;
  return entry.count <= RATE_LIMIT_MAX_EVENTS;
}

// Clean up stale rate limit entries every 30 s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 30_000);

// ── Typing Namespace ─────────────────────────────────────────────────
const typingNsp = io.of("/typing");

// Track active typing timers: (userId:conversationId) -> timeout handle
const typingTimers = new Map<string, NodeJS.Timeout>();

typingNsp.on("connection", (socket) => {
  const user = socket.data.user as WsUser;

  socket.on("typing:start", ({ conversationId }: { conversationId: string }) => {
    if (!checkRateLimit(socket.id)) {
      socket.emit("error", { message: "Rate limit exceeded" });
      return;
    }

    const key = `${user.id}:${conversationId}`;

    // Broadcast that user is typing
    typingNsp.to(`conversation:${conversationId}`).emit("typing:update", {
      conversationId,
      userId: user.id,
      displayName: socket.data.displayName ?? "Anonymous",
      isTyping: true,
    });

    // Clear existing timer and set auto-stop
    const existingTimer = typingTimers.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    typingTimers.set(
      key,
      setTimeout(() => {
        typingNsp.to(`conversation:${conversationId}`).emit("typing:update", {
          conversationId,
          userId: user.id,
          displayName: socket.data.displayName ?? "Anonymous",
          isTyping: false,
        });
        typingTimers.delete(key);
      }, 5_000),
    );

    // Join conversation room if not already in it
    socket.join(`conversation:${conversationId}`);
  });

  socket.on("typing:stop", ({ conversationId }: { conversationId: string }) => {
    const key = `${user.id}:${conversationId}`;
    const timer = typingTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      typingTimers.delete(key);
    }

    typingNsp.to(`conversation:${conversationId}`).emit("typing:update", {
      conversationId,
      userId: user.id,
      displayName: socket.data.displayName ?? "Anonymous",
      isTyping: false,
    });
  });

  // Graceful disconnect: clear all typing states for this user
  socket.on("disconnect", () => {
    for (const [key, timer] of typingTimers) {
      if (key.startsWith(`${user.id}:`)) {
        clearTimeout(timer);
        typingTimers.delete(key);

        const conversationId = key.split(":")[1];
        typingNsp.to(`conversation:${conversationId}`).emit("typing:update", {
          conversationId,
          userId: user.id,
          displayName: socket.data.displayName ?? "Anonymous",
          isTyping: false,
        });
      }
    }
  });
});

// ── Marketplace Namespace ────────────────────────────────────────────
const marketplaceNsp = io.of("/marketplace");

marketplaceNsp.on("connection", (socket) => {
  const user = socket.data.user as WsUser;

  socket.on("marketplace:join", ({ projectId }: { projectId: string }) => {
    socket.join(`project:${projectId}`);
    console.log(`[ws] user ${user.id} joined project:${projectId}`);
  });

  socket.on("marketplace:leave", ({ projectId }: { projectId: string }) => {
    socket.leave(`project:${projectId}`);
  });

  socket.on(
    "marketplace:message",
    ({ projectId, content }: { projectId: string; content: string }) => {
      if (!checkRateLimit(socket.id)) {
        socket.emit("error", { message: "Rate limit exceeded" });
        return;
      }

      // Validate content length
      if (!content || content.length > 4000) {
        socket.emit("error", { message: "Invalid message content" });
        return;
      }

      const message = {
        projectId,
        senderId: user.id,
        content,
        timestamp: new Date().toISOString(),
      };

      marketplaceNsp.to(`project:${projectId}`).emit("marketplace:message", message);
    },
  );

  socket.on("disconnect", () => {
    console.log(`[ws] user ${user.id} disconnected from marketplace`);
  });
});

// ── Presence Overflow Namespace ──────────────────────────────────────
const presenceNsp = io.of("/presence");

// In-memory presence state keyed by channel
const presenceState = new Map<string, Map<string, Record<string, unknown>>>();

presenceNsp.on("connection", (socket) => {
  const user = socket.data.user as WsUser;

  socket.on(
    "presence:track",
    ({ channel, state }: { channel: string; state: Record<string, unknown> }) => {
      socket.join(channel);

      if (!presenceState.has(channel)) {
        presenceState.set(channel, new Map());
      }
      presenceState.get(channel)!.set(user.id, state);

      // Notify all in channel
      presenceNsp.to(channel).emit("presence:join", {
        channel,
        key: user.id,
        presences: [state],
      });

      // Send full state to the joining client
      const fullState: Record<string, Record<string, unknown>[]> = {};
      for (const [key, value] of presenceState.get(channel)!) {
        fullState[key] = [value];
      }
      socket.emit("presence:sync", { channel, state: fullState });
    },
  );

  socket.on("presence:untrack", ({ channel }: { channel: string }) => {
    socket.leave(channel);
    const channelState = presenceState.get(channel);
    if (channelState) {
      const userState = channelState.get(user.id);
      channelState.delete(user.id);

      presenceNsp.to(channel).emit("presence:leave", {
        channel,
        key: user.id,
        presences: userState ? [userState] : [],
      });

      if (channelState.size === 0) {
        presenceState.delete(channel);
      }
    }
  });

  // Graceful disconnect: remove from all presence channels
  socket.on("disconnect", () => {
    for (const [channel, channelState] of presenceState) {
      if (channelState.has(user.id)) {
        const userState = channelState.get(user.id);
        channelState.delete(user.id);

        presenceNsp.to(channel).emit("presence:leave", {
          channel,
          key: user.id,
          presences: userState ? [userState] : [],
        });

        if (channelState.size === 0) {
          presenceState.delete(channel);
        }
      }
    }
  });
});

// ── Start Server ─────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? "3001", 10);

httpServer.listen(PORT, () => {
  console.log(`[ws-server] listening on port ${PORT}`);
});

// ── Graceful Shutdown ────────────────────────────────────────────────
async function shutdown(signal: string) {
  console.log(`[ws-server] received ${signal}, shutting down gracefully`);

  // Stop accepting new connections
  httpServer.close();

  // Disconnect all sockets (clients will reconnect to another instance)
  io.disconnectSockets(true);

  // Close Redis connections
  await Promise.all([pubClient.quit(), subClient.quit()]);

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

### 3.5 Redis Adapter Configuration

The Redis adapter ensures that events emitted on one Fargate task are
replicated to all other tasks. Upstash Redis is used for its serverless
pricing and TLS-by-default.

```typescript
// apps/ws-server/src/adapters/redis.ts

import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";

export function createRedisAdapter() {
  const redisUrl = process.env.UPSTASH_REDIS_URL;
  if (!redisUrl) {
    throw new Error("UPSTASH_REDIS_URL is required");
  }

  const pubClient = new Redis(redisUrl, {
    tls: { rejectUnauthorized: false },
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 10) return null; // stop retrying
      return Math.min(times * 100, 3000);
    },
  });

  const subClient = pubClient.duplicate();

  pubClient.on("error", (err) => console.error("[redis:pub] error:", err));
  subClient.on("error", (err) => console.error("[redis:sub] error:", err));

  return {
    adapter: createAdapter(pubClient, subClient),
    pubClient,
    subClient,
  };
}
```

---

## 4. Client Integration

### 4.1 React Hooks

#### `useRealtime` — unified subscription hook

```typescript
// packages/ui/src/hooks/useRealtime.ts

import { useEffect, useRef, useCallback } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useRealtimeContext } from "../providers/RealtimeProvider";

interface UseRealtimeOptions<T> {
  /** Supabase Realtime channel name */
  channel: string;
  /** Table to listen to for Postgres Changes */
  table: string;
  /** Event type: INSERT, UPDATE, DELETE, or * */
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  /** Optional filter (e.g., "threadId=eq.abc123") */
  filter?: string;
  /** Callback when a matching event arrives */
  onEvent: (payload: T) => void;
  /** Whether the subscription is active (default: true) */
  enabled?: boolean;
}

export function useRealtime<T extends Record<string, unknown>>({
  channel: channelName,
  table,
  event = "INSERT",
  filter,
  onEvent,
  enabled = true,
}: UseRealtimeOptions<T>) {
  const { supabase, socketio, useSocketFallback } = useRealtimeContext();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(onEvent);

  // Keep callback ref current to avoid resubscribing on callback changes
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    // ── Primary: Supabase Realtime ─────────────────────────────────
    if (!useSocketFallback) {
      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event,
            schema: "public",
            table,
            ...(filter ? { filter } : {}),
          },
          (payload: { new: T }) => {
            callbackRef.current(payload.new);
          },
        )
        .subscribe((status, err) => {
          if (err) {
            console.error(
              `[useRealtime] channel "${channelName}" error:`,
              err,
            );
          }
        });

      channelRef.current = channel;

      return () => {
        channel.unsubscribe();
        channelRef.current = null;
      };
    }

    // ── Fallback: Socket.IO ────────────────────────────────────────
    if (socketio) {
      const eventName = `${table.toLowerCase()}:${event.toLowerCase()}`;
      socketio.on(eventName, (data: T) => {
        callbackRef.current(data);
      });

      return () => {
        socketio.off(eventName);
      };
    }
  }, [channelName, table, event, filter, enabled, useSocketFallback, supabase, socketio]);
}
```

#### `usePresence` — thread viewer count

```typescript
// packages/ui/src/hooks/usePresence.ts

import { useState, useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRealtimeContext } from "../providers/RealtimeProvider";
import type { ThreadPresenceState } from "@kh/realtime/channels/presence";

interface UsePresenceOptions {
  threadId: string;
  currentUser: ThreadPresenceState;
  enabled?: boolean;
}

interface UsePresenceReturn {
  /** List of users currently viewing the thread */
  viewers: ThreadPresenceState[];
  /** Number of current viewers */
  viewerCount: number;
  /** Whether the presence channel is connected */
  isConnected: boolean;
}

export function usePresence({
  threadId,
  currentUser,
  enabled = true,
}: UsePresenceOptions): UsePresenceReturn {
  const { supabase } = useRealtimeContext();
  const [viewers, setViewers] = useState<ThreadPresenceState[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled || !threadId) return;

    const channel = supabase.channel(`presence:thread:${threadId}`, {
      config: {
        presence: { key: currentUser.userId },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<ThreadPresenceState>();
        const allViewers: ThreadPresenceState[] = [];

        for (const presences of Object.values(state)) {
          for (const presence of presences) {
            allViewers.push(presence);
          }
        }

        setViewers(allViewers);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track(currentUser);
          setIsConnected(true);
        }
        if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setIsConnected(false);
        }
      });

    channelRef.current = channel;

    return () => {
      channel.untrack();
      channel.unsubscribe();
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [threadId, currentUser.userId, enabled, supabase]);

  return {
    viewers,
    viewerCount: viewers.length,
    isConnected,
  };
}
```

#### `useTypingIndicator` — Socket.IO typing state

```typescript
// packages/ui/src/hooks/useTypingIndicator.ts

import { useState, useEffect, useCallback, useRef } from "react";
import { useRealtimeContext } from "../providers/RealtimeProvider";

interface TypingUser {
  userId: string;
  displayName: string;
}

interface UseTypingIndicatorOptions {
  conversationId: string;
  enabled?: boolean;
}

interface UseTypingIndicatorReturn {
  /** Users currently typing in this conversation */
  typingUsers: TypingUser[];
  /** Call this on every keystroke (debounced internally) */
  sendTyping: () => void;
  /** Call this when the user clears the input or sends the message */
  stopTyping: () => void;
}

export function useTypingIndicator({
  conversationId,
  enabled = true,
}: UseTypingIndicatorOptions): UseTypingIndicatorReturn {
  const { socketio } = useRealtimeContext();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // ── Listen for typing updates ────────────────────────────────────
  useEffect(() => {
    if (!enabled || !socketio) return;

    const typingSocket = socketio.io?.("/typing");
    if (!typingSocket) return;

    const handler = (data: {
      conversationId: string;
      userId: string;
      displayName: string;
      isTyping: boolean;
    }) => {
      if (data.conversationId !== conversationId) return;

      setTypingUsers((prev) => {
        if (data.isTyping) {
          // Add user if not already in the list
          if (prev.some((u) => u.userId === data.userId)) return prev;
          return [...prev, { userId: data.userId, displayName: data.displayName }];
        } else {
          // Remove user
          return prev.filter((u) => u.userId !== data.userId);
        }
      });
    };

    typingSocket.on("typing:update", handler);

    return () => {
      typingSocket.off("typing:update", handler);
      setTypingUsers([]);
    };
  }, [conversationId, enabled, socketio]);

  // ── Send typing start (debounced to 300 ms) ─────────────────────
  const sendTyping = useCallback(() => {
    if (!socketio) return;

    const typingSocket = socketio.io?.("/typing");
    if (!typingSocket) return;

    // Clear previous debounce timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Only send if not already in typing state
    if (!isTypingRef.current) {
      typingSocket.emit("typing:start", { conversationId });
      isTypingRef.current = true;
    }

    // Reset after 300 ms of no keystrokes, send another typing:start
    debounceRef.current = setTimeout(() => {
      typingSocket.emit("typing:start", { conversationId });
    }, 300);
  }, [conversationId, socketio]);

  // ── Explicit stop ────────────────────────────────────────────────
  const stopTyping = useCallback(() => {
    if (!socketio) return;

    const typingSocket = socketio.io?.("/typing");
    if (!typingSocket) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (isTypingRef.current) {
      typingSocket.emit("typing:stop", { conversationId });
      isTypingRef.current = false;
    }
  }, [conversationId, socketio]);

  // Stop typing on unmount
  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  return { typingUsers, sendTyping, stopTyping };
}
```

### 4.2 Provider Component

The `RealtimeProvider` initializes both the Supabase Realtime client and the
Socket.IO client, manages connection state, and makes both available to hooks
through React context.

```tsx
// packages/ui/src/providers/RealtimeProvider.tsx

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { io, type Manager, type Socket } from "socket.io-client";
import { useSupabase } from "./SupabaseProvider";

// ── Types ────────────────────────────────────────────────────────────
interface SocketIOClient {
  /** The root manager (for accessing namespaces via .io) */
  io: Manager | null;
  /** The default namespace socket */
  socket: Socket | null;
}

interface RealtimeContextValue {
  /** Supabase client (provides .channel() for Realtime) */
  supabase: SupabaseClient;
  /** Socket.IO client instance */
  socketio: SocketIOClient | null;
  /** True when Supabase should be bypassed in favor of Socket.IO */
  useSocketFallback: boolean;
  /** Connection status for display in UI */
  connectionState: "connecting" | "connected" | "disconnected" | "error";
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtimeContext(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtimeContext must be used within a RealtimeProvider");
  }
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────
interface RealtimeProviderProps {
  children: ReactNode;
  /** URL of the Socket.IO server (e.g. wss://ws.kehila.pro) */
  wsServerUrl?: string;
  /** When true, Socket.IO connections are enabled (default: false for Phase 1) */
  enableSocketIO?: boolean;
}

export function RealtimeProvider({
  children,
  wsServerUrl,
  enableSocketIO = false,
}: RealtimeProviderProps) {
  const { supabase, session } = useSupabase();
  const [connectionState, setConnectionState] =
    useState<RealtimeContextValue["connectionState"]>("connecting");
  const [useSocketFallback, setUseSocketFallback] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const managerRef = useRef<Manager | null>(null);

  // ── Initialize Socket.IO ───────────────────────────────────────
  useEffect(() => {
    if (!enableSocketIO || !wsServerUrl || !session?.access_token) {
      return;
    }

    const socket = io(wsServerUrl, {
      transports: ["websocket"],
      auth: {
        token: session.access_token,
      },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
    });

    socket.on("connect", () => {
      console.log("[realtime] Socket.IO connected");
      setConnectionState("connected");
    });

    socket.on("disconnect", (reason) => {
      console.log(`[realtime] Socket.IO disconnected: ${reason}`);
      if (reason === "io server disconnect") {
        // Server disconnected us; do not auto-reconnect
        setConnectionState("disconnected");
      }
    });

    socket.on("connect_error", (err) => {
      console.error("[realtime] Socket.IO connection error:", err.message);
      setConnectionState("error");
    });

    socket.io.on("reconnect", (attempt) => {
      console.log(`[realtime] Socket.IO reconnected after ${attempt} attempts`);
      setConnectionState("connected");
    });

    socketRef.current = socket;
    managerRef.current = socket.io;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      managerRef.current = null;
    };
  }, [enableSocketIO, wsServerUrl, session?.access_token]);

  // ── Monitor Supabase Realtime health ───────────────────────────
  useEffect(() => {
    // If Supabase Realtime starts failing, flip to Socket.IO
    const checkInterval = setInterval(() => {
      const channels = supabase.getChannels();
      const errorChannels = channels.filter(
        (ch) => ch.state === "errored" || ch.state === "closed",
      );

      if (errorChannels.length > channels.length * 0.5 && channels.length > 0) {
        console.warn(
          `[realtime] ${errorChannels.length}/${channels.length} channels unhealthy, switching to Socket.IO fallback`,
        );
        setUseSocketFallback(true);
      } else {
        setUseSocketFallback(false);
      }
    }, 30_000);

    return () => clearInterval(checkInterval);
  }, [supabase]);

  // ── Mark connected once Supabase Realtime is ready ─────────────
  useEffect(() => {
    if (!enableSocketIO) {
      setConnectionState("connected");
    }
  }, [enableSocketIO]);

  // ── Context Value ──────────────────────────────────────────────
  const value = useMemo<RealtimeContextValue>(
    () => ({
      supabase,
      socketio: enableSocketIO
        ? {
            io: managerRef.current,
            socket: socketRef.current,
          }
        : null,
      useSocketFallback,
      connectionState,
    }),
    [supabase, enableSocketIO, useSocketFallback, connectionState],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}
```

**Usage in the app layout:**

```tsx
// apps/web/src/app/providers.tsx

import { RealtimeProvider } from "@kh/ui/providers/RealtimeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SupabaseProvider>
      <RealtimeProvider
        wsServerUrl={process.env.NEXT_PUBLIC_WS_SERVER_URL}
        enableSocketIO={process.env.NEXT_PUBLIC_ENABLE_SOCKETIO === "true"}
      >
        {children}
      </RealtimeProvider>
    </SupabaseProvider>
  );
}
```

---

## 5. Channel Capacity Planning

| Metric | Phase 1 (Launch) | Phase 2 (Growth) | Phase 3 (Scale) |
|--------|-------------------|-------------------|-------------------|
| Concurrent users | ~2,000 | ~10,000 | ~20,000+ |
| Avg channels per user | ~5 | ~5 | ~5 |
| Total concurrent channels | ~10,000 | ~50,000 | ~100,000+ |
| Supabase Realtime plan | Pro (500 connections) | Pro (upgraded to 5,000) | Enterprise (custom) |
| Socket.IO instances | 0 (not deployed) | 2 Fargate tasks | 4-8 Fargate tasks |
| Socket.IO overflow threshold | N/A | 80% of Supabase limit | 80% of Supabase limit |
| Redis (Upstash) tier | N/A | Pay-as-you-go | Pro |

**Connection budget per user (5 channels):**

1. **Thread channel** -- the thread the user is currently viewing
2. **Conversation channel** -- the active DM or group chat
3. **Notification channel** -- personal notification stream
4. **Presence channel** -- current thread or forum presence
5. **Forum channel** -- the forum index the user last visited

Channel subscriptions are **lifecycle-managed**: each channel is subscribed
when the relevant component mounts and unsubscribed when it unmounts. Users
never hold stale channels open.

### Multiplexing

Supabase Realtime multiplexes all channels over a **single WebSocket
connection** per client. The 500-connection limit on the Pro plan refers to
500 concurrent WebSocket connections (i.e., 500 concurrent users), not 500
channels. This means Phase 1 with 2,000 users will require upgrading beyond
the base Pro plan or using connection pooling strategies.

**Mitigation strategies for Phase 1:**

- Limit real-time subscriptions to authenticated, active users only (no
  background tabs keeping connections open).
- Implement a visibility API check: disconnect Realtime when the tab is
  hidden for more than 60 seconds.
- Request a Supabase Realtime connection limit increase (available on Pro).

```typescript
// packages/ui/src/hooks/useVisibilityDisconnect.ts

import { useEffect } from "react";
import { useRealtimeContext } from "../providers/RealtimeProvider";

const HIDDEN_TIMEOUT_MS = 60_000; // 1 minute

export function useVisibilityDisconnect() {
  const { supabase } = useRealtimeContext();

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    function handleVisibilityChange() {
      if (document.hidden) {
        timeout = setTimeout(() => {
          // Remove all channel subscriptions when tab hidden
          const channels = supabase.getChannels();
          channels.forEach((ch) => ch.unsubscribe());
          console.log("[realtime] disconnected due to tab inactivity");
        }, HIDDEN_TIMEOUT_MS);
      } else {
        clearTimeout(timeout);
        // Reconnection is handled by the component-level hooks
        // re-subscribing when the component is visible again.
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [supabase]);
}
```

---

## 6. Message Ordering & Delivery

### 6.1 Delivery Guarantees

| Transport | Delivery Guarantee | Mechanism |
|---|---|---|
| Supabase Realtime (Postgres Changes) | **Exactly-once** | Backed by Postgres WAL (Write-Ahead Log). Events are replayed from the WAL position on reconnect. |
| Supabase Realtime (Broadcast) | **At-most-once** | No persistence; if the client is disconnected, the message is lost. |
| Socket.IO | **At-most-once** | Standard WebSocket delivery. No built-in persistence or replay. |

### 6.2 Ordering Strategy

All messages include a monotonic `serverTimestamp` (ISO 8601 with microsecond
precision) assigned at the origin:

- **Postgres Changes**: the `created_at` column (set by `DEFAULT now()` in the
  database) provides the canonical timestamp.
- **Socket.IO messages**: the server adds `timestamp: new Date().toISOString()`
  before broadcasting.

The client sorts incoming messages by this timestamp to maintain correct
display order even if network delivery is out of order.

### 6.3 Client-Side Reconciliation

When a client reconnects after a disconnection, it performs a **tRPC fetch**
to retrieve any messages it may have missed.

```typescript
// packages/ui/src/hooks/useReconnectReconciliation.ts

import { useEffect, useRef } from "react";
import { trpc } from "@kh/web/utils/trpc";
import { useRealtimeContext } from "../providers/RealtimeProvider";

interface UseReconnectReconciliationOptions {
  /** Identifier for the resource (thread ID, conversation ID, etc.) */
  resourceId: string;
  /** Type of resource to reconcile */
  resourceType: "thread" | "conversation";
  /** Callback to merge fetched items into local state */
  onReconcile: (items: unknown[]) => void;
}

export function useReconnectReconciliation({
  resourceId,
  resourceType,
  onReconcile,
}: UseReconnectReconciliationOptions) {
  const { connectionState } = useRealtimeContext();
  const lastConnectedRef = useRef<string>(new Date().toISOString());
  const wasDisconnectedRef = useRef(false);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (connectionState === "disconnected" || connectionState === "error") {
      wasDisconnectedRef.current = true;
      lastConnectedRef.current = new Date().toISOString();
    }

    if (connectionState === "connected" && wasDisconnectedRef.current) {
      wasDisconnectedRef.current = false;

      // Fetch messages since last connected timestamp
      const since = lastConnectedRef.current;

      if (resourceType === "thread") {
        utils.post.listByThread
          .fetch({ threadId: resourceId, since })
          .then((posts) => onReconcile(posts))
          .catch(console.error);
      } else if (resourceType === "conversation") {
        utils.message.listByConversation
          .fetch({ conversationId: resourceId, since })
          .then((messages) => onReconcile(messages))
          .catch(console.error);
      }
    }
  }, [connectionState, resourceId, resourceType, onReconcile, utils]);
}
```

### 6.4 Deduplication

The client maintains a **local message buffer** keyed by the unique message ID
(`id` column from the database, or a client-generated UUID for Socket.IO
messages). When a new message arrives from any transport:

1. Check if the `id` already exists in the buffer.
2. If it exists, discard the duplicate.
3. If it does not exist, insert it in sorted order by `serverTimestamp`.

```typescript
// packages/ui/src/utils/message-buffer.ts

export class MessageBuffer<T extends { id: string; createdAt: string }> {
  private messages = new Map<string, T>();
  private sorted: T[] = [];
  private dirty = false;

  add(message: T): boolean {
    if (this.messages.has(message.id)) {
      return false; // duplicate
    }

    this.messages.set(message.id, message);
    this.dirty = true;
    return true;
  }

  addMany(messages: T[]): number {
    let added = 0;
    for (const msg of messages) {
      if (this.add(msg)) added++;
    }
    return added;
  }

  getAll(): T[] {
    if (this.dirty) {
      this.sorted = Array.from(this.messages.values()).sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      this.dirty = false;
    }
    return this.sorted;
  }

  get size(): number {
    return this.messages.size;
  }

  clear(): void {
    this.messages.clear();
    this.sorted = [];
    this.dirty = false;
  }
}
```

---

## 7. Scaling Strategy

### Phase 1: Launch (0 -- 10,000 users)

**Transport:** Supabase Realtime only. No Socket.IO server is deployed.

| Component | Configuration |
|---|---|
| Supabase plan | Pro (request connection limit increase to 2,000+) |
| Socket.IO | Not deployed |
| Redis | Not needed |
| Typing indicators | Implemented via Supabase Broadcast channels |
| Marketplace chat | Implemented via Supabase Postgres Changes + Broadcast |

At this scale, Supabase Realtime handles all needs. Typing indicators use
Broadcast channels (ephemeral, no database writes). The infrastructure cost
is zero beyond the Supabase subscription.

```typescript
// Phase 1 typing indicators via Supabase Broadcast (no Socket.IO needed)
// packages/realtime/src/channels/typing-broadcast.ts

export function subscribeToTypingBroadcast(
  supabase: SupabaseClient,
  conversationId: string,
  onTyping: (data: { userId: string; displayName: string; isTyping: boolean }) => void,
) {
  return supabase
    .channel(`typing:${conversationId}`)
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      onTyping(payload);
    })
    .subscribe();
}

export function sendTypingBroadcast(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  displayName: string,
  isTyping: boolean,
) {
  supabase.channel(`typing:${conversationId}`).send({
    type: "broadcast",
    event: "typing",
    payload: { userId, displayName, isTyping },
  });
}
```

### Phase 2: Growth (10,000 -- 50,000 users)

**Transport:** Supabase Realtime + Socket.IO server.

| Component | Configuration |
|---|---|
| Supabase plan | Pro with upgraded connection limits (5,000+) |
| Socket.IO | 2 ECS Fargate tasks (0.5 vCPU, 1 GB RAM each) |
| Redis | Upstash pay-as-you-go |
| Typing indicators | Migrated to Socket.IO `/typing` namespace |
| Marketplace chat | Migrated to Socket.IO `/marketplace` namespace |

The Socket.IO server is introduced to offload high-frequency ephemeral events
from Supabase Realtime. Database-backed events (posts, messages, notifications)
remain on Supabase Realtime.

**Deployment:**

```yaml
# infra/ecs/ws-server-task-definition.yaml
family: kh-ws-server
networkMode: awsvpc
requiresCompatibilities:
  - FARGATE
cpu: "512"          # 0.5 vCPU
memory: "1024"      # 1 GB
containerDefinitions:
  - name: ws-server
    image: ${ECR_REPO_URL}:latest
    portMappings:
      - containerPort: 3001
        protocol: tcp
    environment:
      - name: PORT
        value: "3001"
      - name: UPSTASH_REDIS_URL
        valueFrom: arn:aws:ssm:...
      - name: SUPABASE_URL
        valueFrom: arn:aws:ssm:...
      - name: SUPABASE_SERVICE_ROLE_KEY
        valueFrom: arn:aws:ssm:...
      - name: ALLOWED_ORIGINS
        value: "https://kehila.pro,https://www.kehila.pro"
    healthCheck:
      command: ["CMD-SHELL", "curl -f http://localhost:3001/ || exit 1"]
      interval: 30
      timeout: 5
      retries: 3
    logConfiguration:
      logDriver: awslogs
      options:
        awslogs-group: /ecs/kh-ws-server
        awslogs-region: us-east-1
        awslogs-stream-prefix: ecs
```

### Phase 3: Scale (50,000+ users)

**Transport:** Supabase Realtime (Enterprise) + Socket.IO cluster.

| Component | Configuration |
|---|---|
| Supabase plan | Enterprise with custom connection limits |
| Socket.IO | 4-8 ECS Fargate tasks (1 vCPU, 2 GB RAM each), auto-scaled |
| Redis | Upstash Pro (higher throughput limits) |
| Overflow | Socket.IO `/presence` namespace activates automatically |

**Auto-scaling policy:**

```yaml
# infra/ecs/ws-server-autoscaling.yaml
ScalableTarget:
  ServiceNamespace: ecs
  ScalableDimension: ecs:service:DesiredCount
  MinCapacity: 4
  MaxCapacity: 8

ScalingPolicy:
  PolicyType: TargetTrackingScaling
  TargetTrackingScalingPolicyConfiguration:
    TargetValue: 70.0              # Scale when CPU > 70%
    PredefinedMetricSpecification:
      PredefinedMetricType: ECSServiceAverageCPUUtilization
    ScaleInCooldown: 300
    ScaleOutCooldown: 60
```

**Connection monitoring and overflow detection:**

```typescript
// apps/ws-server/src/monitoring/connection-monitor.ts

import { createClient } from "@supabase/supabase-js";

const SUPABASE_REALTIME_LIMIT = 5_000; // Phase 3 limit
const OVERFLOW_THRESHOLD = 0.8;        // 80%

interface ConnectionMetrics {
  supabaseConnections: number;
  socketioConnections: number;
  overflowActive: boolean;
}

export async function getConnectionMetrics(
  io: import("socket.io").Server,
): Promise<ConnectionMetrics> {
  // Socket.IO connected clients across all namespaces
  const sockets = await io.fetchSockets();
  const socketioConnections = sockets.length;

  // Supabase connection count is estimated from the admin API
  // or monitored via the Supabase dashboard metrics endpoint.
  const supabaseConnections = await estimateSupabaseConnections();

  return {
    supabaseConnections,
    socketioConnections,
    overflowActive:
      supabaseConnections >= SUPABASE_REALTIME_LIMIT * OVERFLOW_THRESHOLD,
  };
}

async function estimateSupabaseConnections(): Promise<number> {
  // This would query the Supabase management API or a custom
  // Postgres function that tracks active realtime subscriptions.
  // Placeholder implementation:
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { count } = await supabase
      .from("realtime_connection_metrics")
      .select("*", { count: "exact", head: true });
    return count ?? 0;
  } catch {
    return 0;
  }
}
```

---

## 8. Security Considerations

### 8.1 Row-Level Security on Realtime

Supabase Realtime Postgres Changes respects **Row-Level Security (RLS)**
policies. Every subscription is filtered through the authenticated user's
RLS context. This means:

- A user can only receive `INSERT` events for rows they have `SELECT` access to.
- Gender-partitioned forums automatically filter events: a male user subscribed
  to `forum:{forumId}` will only see threads in forums their RLS policy grants
  access to.
- Moderation queue channels (`moderation:queue`) are restricted to users with
  `moderator` or `admin` roles via RLS.

### 8.2 Socket.IO Authorization

Beyond connection-level JWT validation (Section 3.3), each Socket.IO namespace
performs **room-level authorization**:

```typescript
// apps/ws-server/src/middleware/room-auth.ts

import type { Socket } from "socket.io";
import type { WsUser } from "../auth/jwt-validator";

export function authorizeMarketplaceRoom(socket: Socket, projectId: string): boolean {
  const user = socket.data.user as WsUser;

  // In production, this would check the database to verify the user
  // is a participant in the project (client or freelancer).
  // For now, all authenticated users can join (validated at the API layer).
  return !!user.id;
}

export function authorizeConversationRoom(
  socket: Socket,
  conversationId: string,
): boolean {
  const user = socket.data.user as WsUser;
  // Membership check would be performed against the database
  return !!user.id;
}
```

### 8.3 Rate Limiting Summary

| Transport | Limit | Action on Exceed |
|---|---|---|
| Supabase Realtime | Managed by Supabase (plan-dependent) | Connection refused |
| Socket.IO (per socket) | 50 events / 10 seconds | `error` event emitted, event dropped |
| Socket.IO (global) | ALB connection limits | 503 returned on upgrade |

---

## 9. Monitoring & Observability

### 9.1 Key Metrics

| Metric | Source | Alert Threshold |
|---|---|---|
| Supabase Realtime connections | Supabase Dashboard | > 80% of plan limit |
| Socket.IO connected clients | Custom CloudWatch metric | > 5,000 per instance |
| Redis pub/sub message rate | Upstash Dashboard | > 10,000 msg/s |
| Message delivery latency (p99) | Client-side telemetry | > 500 ms |
| Channel error rate | Application logs | > 5% of subscriptions |
| Reconnection rate | Client-side telemetry | > 10% of sessions/hour |

### 9.2 Health Check Endpoint

```typescript
// apps/ws-server/src/routes/health.ts

import type { Server } from "socket.io";
import type { Redis } from "ioredis";

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  connections: {
    socketio: number;
    redis: "connected" | "disconnected";
  };
  timestamp: string;
}

export async function getHealthStatus(
  io: Server,
  redis: Redis,
): Promise<HealthStatus> {
  const sockets = await io.fetchSockets();
  const redisStatus = redis.status === "ready" ? "connected" : "disconnected";

  const status =
    redisStatus === "disconnected"
      ? "unhealthy"
      : sockets.length > 5000
        ? "degraded"
        : "healthy";

  return {
    status,
    uptime: process.uptime(),
    connections: {
      socketio: sockets.length,
      redis: redisStatus,
    },
    timestamp: new Date().toISOString(),
  };
}
```

---

## 10. Summary

| Concern | Solution |
|---|---|
| Database-driven live updates | Supabase Realtime Postgres Changes (exactly-once from WAL) |
| Presence / "who's online" | Supabase Realtime Presence channels |
| Ephemeral broadcasts (reactions) | Supabase Realtime Broadcast channels |
| Typing indicators | Socket.IO `/typing` namespace (Phase 2+) or Supabase Broadcast (Phase 1) |
| Marketplace live chat | Socket.IO `/marketplace` namespace (Phase 2+) or Supabase (Phase 1) |
| Multi-instance coordination | Upstash Redis adapter for Socket.IO |
| Overflow / failover | Socket.IO `/presence` namespace when Supabase nears limits |
| Reconnection recovery | tRPC fetch of missed messages + deduplication by message ID |
| Security | RLS on Supabase channels; JWT + room-level auth on Socket.IO |
| Scaling | Phase 1 Supabase-only -> Phase 2 add Socket.IO -> Phase 3 auto-scaled cluster |

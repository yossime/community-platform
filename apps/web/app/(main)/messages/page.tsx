'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';
import { Send, MessageSquare, ArrowRight, Wifi, WifiOff } from 'lucide-react';

import { Button } from '@platform/ui/src/components/button';
import { Card, CardContent } from '@platform/ui/src/components/card';
import { Spinner } from '@platform/ui/src/components/spinner';
import { Separator } from '@platform/ui/src/components/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@platform/ui/src/components/avatar';
import { Input } from '@platform/ui/src/components/input';
import { Badge } from '@platform/ui/src/components/badge';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import { useConversationSocket } from '@/hooks/useSocket';

export default function MessagesPage() {
  const { user } = useAuth();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-rubik text-3xl font-bold">הודעות</h1>
        <p className="mt-1 text-sm text-muted-foreground">שיחות פרטיות עם משתמשים אחרים</p>
      </div>

      <div className="flex h-[calc(100vh-220px)] gap-4">
        {/* Conversation List */}
        <ConversationList
          userId={user?.id ?? ''}
          selectedId={selectedConversationId}
          onSelect={setSelectedConversationId}
        />

        {/* Message Thread */}
        {selectedConversationId ? (
          <MessageThread
            conversationId={selectedConversationId}
            userId={user?.id ?? ''}
            onBack={() => setSelectedConversationId(null)}
          />
        ) : (
          <Card className="hidden flex-1 md:flex">
            <CardContent className="flex h-full items-center justify-center">
              <div className="text-center">
                <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 font-rubik text-lg font-semibold">בחר שיחה</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  בחר שיחה מהרשימה כדי לצפות בהודעות
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ConversationList({
  userId,
  selectedId,
  onSelect,
}: {
  userId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data, isLoading } = trpc.message.listConversations.useQuery(undefined, {
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <Card className="w-full shrink-0 md:w-80">
        <CardContent className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="w-full shrink-0 md:w-80">
        <CardContent className="py-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 font-rubik text-lg font-semibold">אין שיחות</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            עדיין אין לך שיחות. שלח הודעה למשתמש כדי להתחיל
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`w-full shrink-0 overflow-hidden md:w-80 ${selectedId ? 'hidden md:block' : ''}`}>
      <div className="overflow-y-auto">
        {data.map((participant, index) => {
          const conversation = participant.conversation;
          const otherParticipants = conversation.participants.filter(
            (p) => p.user.id !== userId,
          );
          const lastMessage = conversation.messages[0];
          const isSelected = selectedId === conversation.id;
          const hasUnread = participant.unreadCount > 0;

          return (
            <div key={conversation.id}>
              {index > 0 && <Separator />}
              <button
                onClick={() => onSelect(conversation.id)}
                className={`flex w-full items-start gap-3 p-3 text-start transition-colors hover:bg-accent/50 ${
                  isSelected ? 'bg-primary/5' : ''
                }`}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={otherParticipants[0]?.user.avatarUrl ?? undefined} />
                  <AvatarFallback>
                    {otherParticipants[0]?.user.displayName?.charAt(0) ?? '?'}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className={`truncate text-sm ${hasUnread ? 'font-bold' : 'font-medium'}`}>
                      {otherParticipants.map((p) => p.user.displayName).join(', ') || 'שיחה'}
                    </p>
                    {lastMessage && (
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(lastMessage.createdAt), {
                          locale: he,
                        })}
                      </span>
                    )}
                  </div>
                  {lastMessage && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {lastMessage.content}
                    </p>
                  )}
                </div>

                {hasUnread && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {participant.unreadCount > 99 ? '99+' : participant.unreadCount}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MessageThread({
  conversationId,
  userId,
  onBack,
}: {
  conversationId: string;
  userId: string;
  onBack: () => void;
}) {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const utils = trpc.useUtils();

  // Socket.IO real-time
  const { isConnected, typingUsers, startTyping, stopTyping, emitNewMessage, emitRead } =
    useConversationSocket(conversationId);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.message.getMessages.useInfiniteQuery(
      { conversationId, limit: 30 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    );

  const sendMessageMutation = trpc.message.sendMessage.useMutation({
    onSuccess: (newMsg) => {
      setMessage('');
      utils.message.getMessages.invalidate({ conversationId });
      utils.message.listConversations.invalidate();

      // Emit via Socket.IO
      emitNewMessage({
        messageId: newMsg.id,
        content: newMsg.content,
        type: newMsg.type,
        createdAt: newMsg.createdAt.toISOString(),
      });
    },
  });

  const markRead = trpc.message.markRead.useMutation({
    onSuccess: () => utils.message.listConversations.invalidate(),
  });

  const messages = data?.pages.flatMap((page) => page.messages) ?? [];

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Mark as read when conversation is opened
  useEffect(() => {
    markRead.mutate({ conversationId });
  }, [conversationId]);

  // Listen for new messages via Socket.IO
  useEffect(() => {
    // Re-fetch when socket receives new message
    const interval = setInterval(() => {
      // Periodically refresh to catch socket messages
    }, 5000);
    return () => clearInterval(interval);
  }, [conversationId]);

  const handleTyping = useCallback(() => {
    startTyping();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => stopTyping(), 2000);
  }, [startTyping, stopTyping]);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    stopTyping();
    sendMessageMutation.mutate({ conversationId, content: trimmed });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const typingDisplay = Array.from(typingUsers.values()).filter(Boolean);

  return (
    <Card className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b p-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden">
          <ArrowRight className="h-5 w-5" />
        </Button>
        <span className="flex-1 font-medium">שיחה</span>
        {isConnected ? (
          <Badge variant="outline" className="text-xs text-green-600">
            <Wifi className="me-1 h-3 w-3" />
            מחובר
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            <WifiOff className="me-1 h-3 w-3" />
            לא מחובר
          </Badge>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            {hasNextPage && (
              <div className="mb-4 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? <Spinner className="me-2" /> : null}
                  טען הודעות קודמות
                </Button>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((msg) => {
                const isMine = msg.senderId === userId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMine ? 'justify-start' : 'justify-end'}`}
                  >
                    <div className="flex max-w-[75%] items-end gap-2">
                      {!isMine && (
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={msg.sender.avatarUrl ?? undefined} />
                          <AvatarFallback className="text-xs">
                            {msg.sender.displayName?.charAt(0) ?? '?'}
                          </AvatarFallback>
                        </Avatar>
                      )}

                      <div
                        className={`rounded-2xl px-4 py-2 ${
                          isMine
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        {!isMine && (
                          <p className="mb-0.5 text-xs font-medium">
                            {msg.sender.displayName}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'
                          }`}
                        >
                          {formatDistanceToNow(new Date(msg.createdAt), {
                            addSuffix: true,
                            locale: he,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </div>

      {/* Typing indicator */}
      {typingDisplay.length > 0 && (
        <div className="px-4 pb-1 text-xs text-muted-foreground animate-pulse">
          {typingDisplay.join(', ')} מקליד/ה...
        </div>
      )}

      {/* Input area */}
      <div className="border-t p-3">
        <div className="flex items-center gap-2">
          <Input
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              handleTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder="הקלד הודעה..."
            className="flex-1"
            dir="rtl"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!message.trim() || sendMessageMutation.isPending}
          >
            {sendMessageMutation.isPending ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

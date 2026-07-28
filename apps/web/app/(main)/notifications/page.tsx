'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  Bell,
  CheckCheck,
  MessageSquare,
  ThumbsUp,
  AtSign,
  Mail,
  Briefcase,
  DollarSign,
  Filter,
} from 'lucide-react';

import { Button } from '@platform/ui/src/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Badge } from '@platform/ui/src/components/badge';
import { Spinner } from '@platform/ui/src/components/spinner';
import { Separator } from '@platform/ui/src/components/separator';

import { trpc } from '@/lib/trpc';

const NOTIFICATION_ICONS: Record<string, typeof Bell> = {
  THREAD_REPLY: MessageSquare,
  POST_REACTION: ThumbsUp,
  MENTION: AtSign,
  NEW_MESSAGE: Mail,
  PROPOSAL_RECEIVED: Briefcase,
  PROPOSAL_ACCEPTED: Briefcase,
  MILESTONE_FUNDED: DollarSign,
  MILESTONE_RELEASED: DollarSign,
};

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const utils = trpc.useUtils();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.notification.list.useInfiniteQuery(
      { limit: 20, unreadOnly },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    );

  const markAsRead = trpc.notification.markAsRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  const markAllAsRead = trpc.notification.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  const { data: unreadCount } = trpc.notification.unreadCount.useQuery();

  const notifications = data?.pages.flatMap((page) => page.notifications) ?? [];

  const handleMarkAsRead = (id: string) => {
    markAsRead.mutate({ ids: [id] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-rubik text-3xl font-bold">התראות</h1>
          {unreadCount && unreadCount > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {unreadCount} התראות שלא נקראו
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">כל ההתראות נקראו</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={unreadOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUnreadOnly(!unreadOnly)}
          >
            <Filter className="me-2 h-4 w-4" />
            {unreadOnly ? 'לא נקראו' : 'הכל'}
          </Button>

          {unreadCount && unreadCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllAsRead.mutate()}
              disabled={markAllAsRead.isPending}
            >
              <CheckCheck className="me-2 h-4 w-4" />
              סמן הכל כנקרא
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        {isLoading ? (
          <CardContent className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </CardContent>
        ) : notifications.length === 0 ? (
          <CardContent className="py-12 text-center">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-rubik text-lg font-semibold">
              {unreadOnly ? 'אין התראות שלא נקראו' : 'אין התראות'}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              כשיהיו לך התראות חדשות, הן יופיעו כאן
            </p>
          </CardContent>
        ) : (
          <div>
            {notifications.map((notification, index) => {
              const Icon = NOTIFICATION_ICONS[notification.type] ?? Bell;
              const isUnread = !notification.readAt;

              return (
                <div key={notification.id}>
                  {index > 0 && <Separator />}
                  <div
                    className={`flex items-start gap-4 p-4 transition-colors hover:bg-accent/50 ${
                      isUnread ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div
                      className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        isUnread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      {notification.actionUrl ? (
                        <Link
                          href={notification.actionUrl}
                          onClick={() => isUnread && handleMarkAsRead(notification.id)}
                          className="hover:underline"
                        >
                          <p className={`text-sm ${isUnread ? 'font-semibold' : ''}`}>
                            {notification.title}
                          </p>
                        </Link>
                      ) : (
                        <p className={`text-sm ${isUnread ? 'font-semibold' : ''}`}>
                          {notification.title}
                        </p>
                      )}
                      <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                        {notification.body}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.createdAt), {
                          addSuffix: true,
                          locale: he,
                        })}
                      </p>
                    </div>

                    {isUnread && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => handleMarkAsRead(notification.id)}
                      >
                        סמן כנקרא
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {hasNextPage && (
              <div className="p-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? <Spinner className="me-2" /> : null}
                  טען עוד
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

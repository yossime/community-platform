'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';

import { Button } from '@platform/ui/src/components/button';
import { Badge } from '@platform/ui/src/components/badge';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';

export function NotificationBell() {
  const { user } = useAuth();
  const { data: unreadCount } = trpc.notification.unreadCount.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000,
  });

  if (!user) return null;

  return (
    <Button variant="ghost" size="icon" className="relative" aria-label="התראות" asChild>
      <Link href="/notifications">
        <Bell className="h-5 w-5" />
        {unreadCount && unreadCount > 0 ? (
          <Badge
            className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px]"
            variant="destructive"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        ) : null}
      </Link>
    </Button>
  );
}

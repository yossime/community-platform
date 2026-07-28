'use client';

import { useEffect } from 'react';

import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';

/**
 * Subscribes to real-time notification inserts via Supabase Realtime.
 * Automatically invalidates the notification queries when a new notification arrives,
 * so the UI updates without polling.
 */
export function useRealtimeNotifications() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!user?.id) return;

    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `userId=eq.${user.id}`,
        },
        () => {
          // Invalidate notification queries to refresh UI
          utils.notification.unreadCount.invalidate();
          utils.notification.list.invalidate();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, utils]);
}

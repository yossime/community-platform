'use client';

import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';

/**
 * Client component that sets up all Supabase Realtime subscriptions.
 * Place inside the authenticated layout so it only subscribes for logged-in users.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useRealtimeNotifications();
  return <>{children}</>;
}

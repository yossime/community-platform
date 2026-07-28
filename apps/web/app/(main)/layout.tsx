export const dynamic = 'force-dynamic';

import Link from 'next/link';

import { SidebarNav } from '@/components/navigation/sidebar-nav';
import { UserMenu } from '@/components/navigation/user-menu';
import { NotificationBell } from '@/components/navigation/notification-bell';
import { MobileNav } from '@/components/navigation/mobile-nav';
import { SearchBar } from '@/components/navigation/search-bar';
import { RealtimeProvider } from '@/components/realtime-provider';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <RealtimeProvider>
      <div className="min-h-screen">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-14 items-center gap-4">
            <MobileNav />

            <Link href="/forums" className="font-rubik text-lg font-bold text-primary">
              קהילת אנשי מקצוע
            </Link>

            <SearchBar />

            <div className="ms-auto flex items-center gap-2">
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
        </header>

        <div className="container flex gap-6 py-6">
          {/* Desktop Sidebar */}
          <aside className="hidden w-60 shrink-0 md:block">
            <div className="sticky top-20">
              <SidebarNav />
            </div>
          </aside>

          {/* Main Content */}
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </RealtimeProvider>
  );
}

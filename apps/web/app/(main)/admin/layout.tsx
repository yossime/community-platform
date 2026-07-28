'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, Users, Flag, BarChart3 } from 'lucide-react';

import { cn } from '@platform/ui/src/lib/utils';

const adminNavItems = [
  { href: '/admin', label: 'סקירה כללית', icon: BarChart3 },
  { href: '/admin/moderation', label: 'ניהול תוכן', icon: Flag },
  { href: '/admin/users', label: 'ניהול משתמשים', icon: Users },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="font-rubik text-3xl font-bold">פאנל ניהול</h1>
      </div>

      <div className="flex gap-2 border-b">
        {adminNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare,
  Newspaper,
  Briefcase,
  GraduationCap,
  BookOpen,
  Users,
  LayoutGrid,
  Mail,
  Bell,
} from 'lucide-react';

import { cn } from '@platform/ui/src/lib/utils';

const navItems = [
  { href: '/forums', label: 'פורומים', icon: MessageSquare },
  { href: '/marketplace', label: 'שוק פרילנסרים', icon: Briefcase },
  { href: '/classifieds', label: 'לוח מודעות', icon: Newspaper },
  { href: '/portfolios', label: 'תיקי עבודות', icon: LayoutGrid },
  { href: '/courses', label: 'קורסים', icon: GraduationCap },
  { href: '/articles', label: 'מאמרים', icon: BookOpen },
  { href: '/directory', label: 'ספר אנשי מקצוע', icon: Users },
  { href: '/messages', label: 'הודעות', icon: Mail },
  { href: '/notifications', label: 'התראות', icon: Bell },
];

interface SidebarNavProps {
  className?: string;
  onItemClick?: () => void;
}

export function SidebarNav({ className, onItemClick }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className={cn('space-y-1', className)}>
      {navItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onItemClick}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

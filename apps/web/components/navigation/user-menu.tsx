'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Settings, User } from 'lucide-react';

import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import { Button } from '@platform/ui/src/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@platform/ui/src/components/dropdown-menu';

import { signOut } from '@/lib/auth';
import { useAuth } from '@/hooks/useAuth';

export function UserMenu() {
  const { user, loading } = useAuth();
  const router = useRouter();

  if (loading) {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/login">התחבר</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/register">הירשם</Link>
        </Button>
      </div>
    );
  }

  const initials = user.user_metadata?.displayName
    ? (user.user_metadata.displayName as string).slice(0, 2)
    : user.email?.slice(0, 2)?.toUpperCase() ?? '??';

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {(user.user_metadata?.displayName as string) ?? 'משתמש'}
            </p>
            <p className="text-xs leading-none text-muted-foreground" dir="ltr">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex cursor-pointer items-center gap-2">
            <User className="h-4 w-4" />
            <span>הפרופיל שלי</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex cursor-pointer items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>הגדרות</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="me-2 h-4 w-4" />
          <span>התנתק</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

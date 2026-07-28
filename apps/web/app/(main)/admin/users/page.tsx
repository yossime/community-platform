'use client';

import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import { Badge } from '@platform/ui/src/components/badge';
import { Button } from '@platform/ui/src/components/button';
import { Card, CardContent } from '@platform/ui/src/components/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@platform/ui/src/components/select';
import { Spinner } from '@platform/ui/src/components/spinner';

import { trpc } from '@/lib/trpc';
import { useState } from 'react';

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' }> = {
  ACTIVE: { label: 'פעיל', variant: 'success' },
  SUSPENDED: { label: 'מושעה', variant: 'warning' },
  BANNED: { label: 'חסום', variant: 'destructive' },
  DEACTIVATED: { label: 'מושבת', variant: 'secondary' },
};

const ROLE_LABELS: Record<string, string> = {
  USER: 'משתמש',
  MODERATOR: 'מנהל',
  ADMIN: 'אדמין',
  SUPER_ADMIN: 'אדמין ראשי',
};

const TIER_LABELS: Record<string, string> = {
  FREE: 'חינם',
  PROFESSIONAL: 'מקצועי',
  BUSINESS: 'עסקי',
  ENTERPRISE: 'ארגוני',
};

type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DEACTIVATED';

export default function UsersManagementPage() {
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'ALL'>('ALL');

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.admin.listUsers.useInfiniteQuery(
      {
        limit: 20,
        ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
      },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    );

  const allUsers = data?.pages.flatMap((page) => page.users) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-rubik text-xl font-semibold">ניהול משתמשים</h2>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as UserStatus | 'ALL')}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">הכל</SelectItem>
            <SelectItem value="ACTIVE">פעילים</SelectItem>
            <SelectItem value="SUSPENDED">מושעים</SelectItem>
            <SelectItem value="BANNED">חסומים</SelectItem>
            <SelectItem value="DEACTIVATED">מושבתים</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : allUsers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">לא נמצאו משתמשים</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {allUsers.map((user) => {
              const statusInfo = STATUS_LABELS[user.status] ?? { label: 'לא ידוע', variant: 'secondary' as const };
              return (
                <Card key={user.id}>
                  <CardContent className="flex items-center gap-4 py-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="text-xs">
                        {user.displayName.slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{user.displayName}</span>
                        <Badge variant={statusInfo.variant} className="text-xs">
                          {statusInfo.label}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {ROLE_LABELS[user.role] ?? user.role}
                        </Badge>
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span dir="ltr">@{user.username}</span>
                        <span dir="ltr">{user.email}</span>
                        {user.membership && (
                          <span>{TIER_LABELS[user.membership.tier] ?? user.membership.tier}</span>
                        )}
                        <span>
                          הצטרף{' '}
                          {new Date(user.createdAt).toLocaleDateString('he-IL')}
                        </span>
                      </div>
                    </div>
                    {user.reputation && (
                      <div className="text-center">
                        <div className="font-rubik text-lg font-bold">{user.reputation.totalScore}</div>
                        <div className="text-xs text-muted-foreground">ניקוד</div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? <Spinner size="sm" /> : 'טען עוד'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

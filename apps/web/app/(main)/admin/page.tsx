'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Spinner } from '@platform/ui/src/components/spinner';

import { trpc } from '@/lib/trpc';

export default function AdminDashboard() {
  const { data: moderationData, isLoading: modLoading } = trpc.admin.getModerationQueue.useQuery({
    limit: 1,
  });
  const { data: usersData, isLoading: usersLoading } = trpc.admin.listUsers.useQuery({
    limit: 1,
  });

  const isLoading = modLoading || usersLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="ממתינים לאישור"
        value={moderationData?.items?.length ?? 0}
        description="תכנים בתור ניהול"
      />
      <StatCard
        title="משתמשים"
        value={usersData?.users?.length ?? 0}
        description="סה&quot;כ משתמשים רשומים"
      />
      <StatCard
        title="נושאים"
        value="-"
        description="נושאים פעילים"
      />
      <StatCard
        title="פרויקטים"
        value="-"
        description="פרויקטים פתוחים"
      />
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string | number;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-rubik text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

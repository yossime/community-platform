'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Clock,
  Users,
  AlertTriangle,
  Search,
  SlidersHorizontal,
} from 'lucide-react';

import { Card, CardContent } from '@platform/ui/src/components/card';
import { Button } from '@platform/ui/src/components/button';
import { Badge } from '@platform/ui/src/components/badge';
import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import { Spinner } from '@platform/ui/src/components/spinner';
import { Input } from '@platform/ui/src/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@platform/ui/src/components/select';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';

function formatCurrency(agorot: number): string {
  return `₪${(agorot / 100).toLocaleString('he-IL')}`;
}

function timeAgo(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'הרגע';
  if (diffMins < 60) return `לפני ${diffMins} דקות`;
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  if (diffDays < 30) return `לפני ${diffDays} ימים`;
  return new Date(date).toLocaleDateString('he-IL');
}

const PROJECT_STATUS_LABELS: Record<string, string> = {
  OPEN: 'פתוח',
  IN_PROGRESS: 'בביצוע',
  COMPLETED: 'הושלם',
  CANCELED: 'בוטל',
};

export function ProjectList() {
  const { user } = useAuth();
  const [sortBy, setSortBy] = useState<'newest' | 'budget_high' | 'budget_low' | 'deadline'>('newest');
  const [skillsFilter, setSkillsFilter] = useState('');

  const skillsArray = skillsFilter
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.marketplace.listProjects.useInfiniteQuery(
    {
      limit: 12,
      sortBy,
      ...(skillsArray.length > 0 ? { skills: skillsArray } : {}),
    },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );

  const allProjects = data?.pages.flatMap((page) => page.projects) ?? [];

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="סנן לפי מיומנויות (הפרד בפסיקים)..."
            value={skillsFilter}
            onChange={(e) => setSkillsFilter(e.target.value)}
            className="ps-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as typeof sortBy)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="מיון" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">חדש ביותר</SelectItem>
              <SelectItem value="budget_high">תקציב גבוה</SelectItem>
              <SelectItem value="budget_low">תקציב נמוך</SelectItem>
              <SelectItem value="deadline">דד-ליין קרוב</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-center text-sm text-destructive">
          שגיאה בטעינת הפרויקטים. נסה לרענן את הדף.
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && allProjects.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Briefcase className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-rubik text-lg font-semibold">
              אין פרויקטים כרגע
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {skillsFilter
                ? 'נסה לשנות את הסינון כדי למצוא פרויקטים'
                : 'פרויקטים חדשים יופיעו כאן בקרוב'}
            </p>
            {user && (
              <Button className="mt-4" asChild>
                <Link href="/marketplace/new">פרסם פרויקט</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Project Grid */}
      {allProjects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {allProjects.map((project) => (
            <Card
              key={project.id}
              className="transition-colors hover:bg-accent/30"
            >
              <CardContent className="p-5">
                {/* Header: Urgent + Status */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {project.isUrgent && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="me-1 h-3 w-3" />
                        דחוף
                      </Badge>
                    )}
                    {project.isFeatured && (
                      <Badge
                        variant="secondary"
                        className="bg-amber-100 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                      >
                        מומלץ
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(project.createdAt)}
                  </span>
                </div>

                {/* Title */}
                <Link
                  href={`/marketplace/${project.slug}`}
                  className="font-rubik text-lg font-semibold leading-tight hover:text-primary line-clamp-2"
                >
                  {project.title}
                </Link>

                {/* Description */}
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                  {project.description}
                </p>

                {/* Budget */}
                <div className="mt-3 font-medium text-primary">
                  {formatCurrency(project.budgetMinAgorot)} -{' '}
                  {formatCurrency(project.budgetMaxAgorot)}
                </div>

                {/* Skills */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {project.skills.slice(0, 4).map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                  {project.skills.length > 4 && (
                    <Badge variant="outline" className="text-xs">
                      +{project.skills.length - 4}
                    </Badge>
                  )}
                </div>

                {/* Footer: Client + Proposals */}
                <div className="mt-4 flex items-center justify-between border-t pt-3">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px]">
                        {project.client.displayName?.slice(0, 2) ?? '??'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-muted-foreground">
                      {project.client.displayName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span>{project._count.proposals} הצעות</span>
                  </div>
                </div>

                {/* Deadline */}
                {project.deadline && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>
                      דד-ליין:{' '}
                      {new Date(project.deadline).toLocaleDateString('he-IL')}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Load More */}
      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? <Spinner size="sm" /> : 'טען עוד'}
          </Button>
        </div>
      )}
    </div>
  );
}

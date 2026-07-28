'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Star,
  Briefcase,
  Search,
  SlidersHorizontal,
  Users,
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

function formatCurrency(agorot: number): string {
  return `₪${(agorot / 100).toLocaleString('he-IL')}`;
}

const AVAILABILITY_DEFAULT = { label: 'זמין', color: 'bg-green-500' } as const;

const AVAILABILITY_CONFIG: Record<string, { label: string; color: string }> = {
  AVAILABLE: AVAILABILITY_DEFAULT,
  BUSY: { label: 'עמוס חלקית', color: 'bg-yellow-500' },
  NOT_AVAILABLE: { label: 'לא זמין', color: 'bg-red-500' },
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < Math.round(rating)
              ? 'fill-amber-400 text-amber-400'
              : 'text-muted-foreground/30'
          }`}
        />
      ))}
      <span className="ms-1 text-sm font-medium">
        {rating > 0 ? rating.toFixed(1) : '—'}
      </span>
    </div>
  );
}

export function FreelancerList() {
  const [sortBy, setSortBy] = useState<'rating' | 'completed' | 'rate_low' | 'rate_high'>('rating');
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
  } = trpc.marketplace.listFreelancers.useInfiniteQuery(
    {
      limit: 12,
      sortBy,
      ...(skillsArray.length > 0 ? { skills: skillsArray } : {}),
    },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );

  const allFreelancers = data?.pages.flatMap((page) => page.profiles) ?? [];

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
              <SelectItem value="rating">דירוג גבוה</SelectItem>
              <SelectItem value="completed">פרויקטים שהושלמו</SelectItem>
              <SelectItem value="rate_low">מחיר נמוך</SelectItem>
              <SelectItem value="rate_high">מחיר גבוה</SelectItem>
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
          שגיאה בטעינת הפרילנסרים. נסה לרענן את הדף.
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && allFreelancers.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-rubik text-lg font-semibold">
              אין פרילנסרים כרגע
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {skillsFilter
                ? 'נסה לשנות את הסינון כדי למצוא פרילנסרים'
                : 'פרילנסרים חדשים יופיעו כאן בקרוב'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Freelancer Grid */}
      {allFreelancers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {allFreelancers.map((freelancer) => {
            const avail =
              AVAILABILITY_CONFIG[freelancer.availability] ?? AVAILABILITY_DEFAULT;

            return (
              <Card
                key={freelancer.id}
                className="transition-colors hover:bg-accent/30"
              >
                <CardContent className="p-5">
                  {/* Header: Avatar + Info */}
                  <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback>
                        {freelancer.user.displayName?.slice(0, 2) ?? '??'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/marketplace/freelancer/${freelancer.user.slug}`}
                        className="font-rubik font-semibold hover:text-primary line-clamp-1"
                      >
                        {freelancer.user.displayName}
                      </Link>
                      {freelancer.headline && (
                        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">
                          {freelancer.headline}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Availability Badge */}
                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${avail.color}`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {avail.label}
                    </span>
                  </div>

                  {/* Rating */}
                  <div className="mt-3">
                    <StarRating rating={freelancer.averageRating} />
                  </div>

                  {/* Skills */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {freelancer.skills.slice(0, 5).map((skill) => (
                      <Badge
                        key={skill}
                        variant="secondary"
                        className="text-xs"
                      >
                        {skill}
                      </Badge>
                    ))}
                    {freelancer.skills.length > 5 && (
                      <Badge variant="outline" className="text-xs">
                        +{freelancer.skills.length - 5}
                      </Badge>
                    )}
                  </div>

                  {/* Footer: Rate + Projects */}
                  <div className="mt-4 flex items-center justify-between border-t pt-3">
                    {freelancer.hourlyRateAgorot ? (
                      <span className="font-medium text-primary">
                        {formatCurrency(freelancer.hourlyRateAgorot)}/שעה
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        לא צוין מחיר
                      </span>
                    )}
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Briefcase className="h-3.5 w-3.5" />
                      <span>
                        {freelancer.completedProjects} פרויקטים
                      </span>
                    </div>
                  </div>

                  {/* Location */}
                  {freelancer.user.location && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {freelancer.user.location}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
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

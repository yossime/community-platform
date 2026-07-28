'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { GraduationCap, Star, Users, Clock, Filter } from 'lucide-react';

import { Button } from '@platform/ui/src/components/button';
import { Card, CardContent } from '@platform/ui/src/components/card';
import { Badge } from '@platform/ui/src/components/badge';
import { Spinner } from '@platform/ui/src/components/spinner';
import { Avatar, AvatarFallback, AvatarImage } from '@platform/ui/src/components/avatar';
import { Input } from '@platform/ui/src/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@platform/ui/src/components/select';

import { trpc } from '@/lib/trpc';

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'מתחילים',
  INTERMEDIATE: 'בינוני',
  ADVANCED: 'מתקדם',
};

const LEVEL_COLORS: Record<string, string> = {
  BEGINNER: 'bg-green-100 text-green-800',
  INTERMEDIATE: 'bg-yellow-100 text-yellow-800',
  ADVANCED: 'bg-red-100 text-red-800',
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} שעות ${minutes > 0 ? `ו-${minutes} דקות` : ''}`;
  return `${minutes} דקות`;
}

function formatPrice(agorot: number): string {
  if (agorot === 0) return 'חינם';
  return `₪${(agorot / 100).toFixed(0)}`;
}

export function CourseList() {
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'rating' | 'price_low' | 'price_high'>('newest');
  const [level, setLevel] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [isFree, setIsFree] = useState<boolean | undefined>(undefined);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.course.list.useInfiniteQuery(
      {
        limit: 12,
        sortBy,
        level: level !== 'all' ? level as 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' : undefined,
        isFree,
        search: search || undefined,
      },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    );

  const courses = data?.pages.flatMap((page) => page.courses) ?? [];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <Input
            placeholder="חיפוש קורסים..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="רמה" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הרמות</SelectItem>
            <SelectItem value="BEGINNER">מתחילים</SelectItem>
            <SelectItem value="INTERMEDIATE">בינוני</SelectItem>
            <SelectItem value="ADVANCED">מתקדם</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={isFree === undefined ? 'all' : isFree ? 'free' : 'paid'}
          onValueChange={(v) => setIsFree(v === 'all' ? undefined : v === 'free')}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="מחיר" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הכל</SelectItem>
            <SelectItem value="free">חינם</SelectItem>
            <SelectItem value="paid">בתשלום</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="מיון" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">חדש ביותר</SelectItem>
            <SelectItem value="popular">פופולרי</SelectItem>
            <SelectItem value="rating">דירוג</SelectItem>
            <SelectItem value="price_low">מחיר: נמוך לגבוה</SelectItem>
            <SelectItem value="price_high">מחיר: גבוה לנמוך</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Course Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GraduationCap className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-rubik text-lg font-semibold">אין קורסים</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {search ? 'לא נמצאו קורסים התואמים לחיפוש' : 'עדיין לא פורסמו קורסים'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <Link key={course.id} href={`/courses/${course.slug}`}>
                <Card className="group h-full overflow-hidden transition-shadow hover:shadow-md">
                  {/* Cover Image */}
                  <div className="relative aspect-video bg-muted">
                    {course.coverImageUrl ? (
                      <Image
                        src={course.coverImageUrl}
                        alt={course.title}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <GraduationCap className="h-12 w-12 text-muted-foreground/50" />
                      </div>
                    )}
                    {/* Price Badge */}
                    <div className="absolute start-3 top-3">
                      <Badge variant={course.isFree ? 'secondary' : 'default'} className="font-bold">
                        {formatPrice(course.priceAgorot)}
                      </Badge>
                    </div>
                  </div>

                  <CardContent className="p-4">
                    {/* Level Badge */}
                    <Badge variant="outline" className={`mb-2 ${LEVEL_COLORS[course.level] ?? ''}`}>
                      {LEVEL_LABELS[course.level] ?? course.level}
                    </Badge>

                    <h3 className="font-rubik text-base font-semibold leading-tight line-clamp-2">
                      {course.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {course.shortDescription}
                    </p>

                    {/* Instructor */}
                    <div className="mt-3 flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={course.instructor.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {course.instructor.displayName?.charAt(0) ?? '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">
                        {course.instructor.displayName}
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                      {course.averageRating > 0 && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          {course.averageRating.toFixed(1)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {course.enrollmentCount} תלמידים
                      </span>
                      <span className="flex items-center gap-1">
                        <GraduationCap className="h-3.5 w-3.5" />
                        {course._count.modules} מודולים
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? <Spinner className="me-2" /> : null}
                טען עוד קורסים
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

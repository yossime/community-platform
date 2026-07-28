'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, Eye, LayoutGrid } from 'lucide-react';

import { Card, CardContent } from '@platform/ui/src/components/card';
import { Button } from '@platform/ui/src/components/button';
import { Badge } from '@platform/ui/src/components/badge';
import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import { Spinner } from '@platform/ui/src/components/spinner';

import { trpc } from '@/lib/trpc';

const CATEGORIES = [
  { value: '', label: 'הכל' },
  { value: 'web-design', label: 'עיצוב אתרים' },
  { value: 'graphic-design', label: 'עיצוב גרפי' },
  { value: 'ui-ux', label: 'UI/UX' },
  { value: 'development', label: 'פיתוח' },
  { value: 'marketing', label: 'שיווק' },
  { value: 'video', label: 'וידאו' },
  { value: 'photography', label: 'צילום' },
  { value: 'other', label: 'אחר' },
];

const SORT_OPTIONS = [
  { value: 'newest' as const, label: 'חדשים' },
  { value: 'popular' as const, label: 'פופולריים' },
  { value: 'most_liked' as const, label: 'הכי אהובים' },
];

export function PortfolioExplore() {
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'most_liked'>('newest');

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.portfolio.explore.useInfiniteQuery(
      {
        limit: 20,
        category: category || undefined,
        sortBy,
      },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    );

  const allProjects = data?.pages.flatMap((page) => page.projects) ?? [];

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="space-y-4">
        {/* Category Pills */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat.value}
              variant={category === cat.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategory(cat.value)}
              className="rounded-full"
            >
              {cat.label}
            </Button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">מיין לפי:</span>
          {SORT_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={sortBy === option.value ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSortBy(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && allProjects.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <LayoutGrid className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-rubik text-lg font-semibold">אין פרויקטים עדיין</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {category
                ? 'לא נמצאו פרויקטים בקטגוריה זו. נסה קטגוריה אחרת.'
                : 'היה הראשון להעלות עבודה לתיק העבודות שלך!'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Masonry Grid */}
      {!isLoading && allProjects.length > 0 && (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
          {allProjects.map((project) => (
            <Link
              key={project.id}
              href={`/portfolios/${project.portfolio.user.slug}/${project.slug}`}
              className="group mb-4 block break-inside-avoid"
            >
              <Card className="overflow-hidden transition-all duration-200 group-hover:scale-[1.02] group-hover:shadow-lg">
                {/* Cover Image */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                  {project.coverImageUrl ? (
                    <Image
                      src={project.coverImageUrl}
                      alt={project.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <LayoutGrid className="h-12 w-12 text-muted-foreground/50" />
                    </div>
                  )}

                  {/* Title Overlay */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-8">
                    <h3 className="font-rubik text-sm font-semibold text-white line-clamp-2">
                      {project.title}
                    </h3>
                  </div>
                </div>

                {/* Footer */}
                <CardContent className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px]">
                        {project.portfolio.user.displayName?.slice(0, 2) ?? '??'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground line-clamp-1">
                      {project.portfolio.user.displayName}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Heart className="h-3 w-3" />
                      <span>{project.likeCount ?? project._count.likes}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      <span>{project.viewCount}</span>
                    </div>
                  </div>
                </CardContent>

                {/* Category Badge */}
                {project.category && (
                  <div className="px-3 pb-3">
                    <Badge variant="secondary" className="text-xs">
                      {CATEGORIES.find((c) => c.value === project.category)?.label ?? project.category}
                    </Badge>
                  </div>
                )}
              </Card>
            </Link>
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

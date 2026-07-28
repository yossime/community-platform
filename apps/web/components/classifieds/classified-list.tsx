'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  Newspaper,
  MapPin,
  Heart,
  Eye,
  Tag,
  Clock,
  Plus,
} from 'lucide-react';

import { Card, CardContent } from '@platform/ui/src/components/card';
import { Button } from '@platform/ui/src/components/button';
import { Badge } from '@platform/ui/src/components/badge';
import { Spinner } from '@platform/ui/src/components/spinner';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import {
  ClassifiedFiltersPanel,
  type ClassifiedFilters,
} from './classified-filters';

const TYPE_LABELS: Record<string, string> = {
  SELLING: 'למכירה',
  BUYING: 'קנייה',
  JOB_OFFER: 'דרושים',
  JOB_SEEKING: 'מחפש עבודה',
  REAL_ESTATE: 'נדל"ן',
  SERVICE: 'שירותים',
  EVENT: 'אירועים',
};

const TYPE_COLORS: Record<string, string> = {
  SELLING: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  BUYING: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  JOB_OFFER: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
  JOB_SEEKING: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
  REAL_ESTATE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  SERVICE: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-100',
  EVENT: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-100',
};

function formatPrice(agorot: number | null | undefined): string {
  if (agorot === null || agorot === undefined || agorot === 0) return '';
  return `\u20AA${(agorot / 100).toLocaleString('he-IL')}`;
}

interface FavoriteButtonProps {
  listingId: string;
}

function FavoriteButton({ listingId }: FavoriteButtonProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: favData } = trpc.classified.isFavorited.useQuery(
    { listingId },
    { enabled: !!user },
  );

  const toggleFavorite = trpc.classified.toggleFavorite.useMutation({
    onSuccess: () => {
      utils.classified.isFavorited.invalidate({ listingId });
      utils.classified.list.invalidate();
    },
  });

  if (!user) return null;

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite.mutate({ listingId });
      }}
      disabled={toggleFavorite.isPending}
      className="rounded-full p-1.5 transition-colors hover:bg-accent"
      aria-label={favData?.favorited ? 'הסר מהמועדפים' : 'הוסף למועדפים'}
    >
      <Heart
        className={`h-4 w-4 ${
          favData?.favorited
            ? 'fill-red-500 text-red-500'
            : 'text-muted-foreground'
        }`}
      />
    </button>
  );
}

export function ClassifiedList() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<ClassifiedFilters>({
    sortBy: 'newest',
  });

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.classified.list.useInfiniteQuery(
    {
      limit: 20,
      type: filters.type as
        | 'SELLING'
        | 'BUYING'
        | 'JOB_OFFER'
        | 'JOB_SEEKING'
        | 'REAL_ESTATE'
        | 'SERVICE'
        | 'EVENT'
        | undefined,
      categorySlug: filters.categorySlug,
      location: filters.location,
      priceMin: filters.priceMin,
      priceMax: filters.priceMax,
      sortBy: filters.sortBy,
    },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );

  const allListings = data?.pages.flatMap((page) => page.listings) ?? [];

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-4 text-center text-sm text-destructive">
        שגיאה בטעינת המודעות. נסה לרענן את הדף.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-rubik text-3xl font-bold">לוח מודעות</h1>
          <p className="mt-2 text-muted-foreground">
            מודעות קנייה, מכירה, דרושים ושירותים
          </p>
        </div>
        {user && (
          <Button asChild>
            <Link href="/classifieds/new">
              <Plus className="me-2 h-4 w-4" />
              פרסם מודעה
            </Link>
          </Button>
        )}
      </div>

      {/* Layout: Sidebar Filters + Grid */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Filters Sidebar */}
        <aside className="w-full shrink-0 lg:w-64">
          <Card>
            <CardContent className="pt-6">
              <ClassifiedFiltersPanel filters={filters} onChange={setFilters} />
            </CardContent>
          </Card>
        </aside>

        {/* Listings Grid */}
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : allListings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Newspaper className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 font-rubik text-lg font-semibold">
                  לא נמצאו מודעות
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  נסה לשנות את המסננים או פרסם מודעה חדשה
                </p>
                {user && (
                  <Button className="mt-4" asChild>
                    <Link href="/classifieds/new">פרסם מודעה</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {allListings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/classifieds/${listing.slug}`}
                    className="block"
                  >
                    <Card
                      className={`h-full transition-shadow hover:shadow-md ${
                        listing.isFeatured
                          ? 'border-2 border-amber-400'
                          : ''
                      }`}
                    >
                      {/* Image / Placeholder */}
                      <div className="relative aspect-[16/10] overflow-hidden rounded-t-lg bg-muted">
                        {listing.images && listing.images.length > 0 ? (
                          <img
                            src={listing.images[0]}
                            alt={listing.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Newspaper className="h-12 w-12 text-muted-foreground/50" />
                          </div>
                        )}
                        {listing.isFeatured && (
                          <Badge className="absolute start-2 top-2 bg-amber-500 text-white hover:bg-amber-600">
                            מודעה מקודמת
                          </Badge>
                        )}
                        <div className="absolute end-2 top-2">
                          <FavoriteButton listingId={listing.id} />
                        </div>
                      </div>

                      <CardContent className="p-4">
                        {/* Type Badge */}
                        <div className="mb-2">
                          <span
                            className={`inline-flex items-center rounded-full border-transparent px-2.5 py-0.5 text-xs font-semibold ${
                              TYPE_COLORS[listing.type] ?? ''
                            }`}
                          >
                            {TYPE_LABELS[listing.type] ?? listing.type}
                          </span>
                        </div>

                        {/* Title */}
                        <h3 className="font-rubik text-base font-semibold line-clamp-2">
                          {listing.title}
                        </h3>

                        {/* Price */}
                        {listing.priceAgorot ? (
                          <p className="mt-1 font-rubik text-lg font-bold text-primary">
                            {formatPrice(listing.priceAgorot)}
                            {listing.priceLabel && (
                              <span className="ms-1 text-xs font-normal text-muted-foreground">
                                {listing.priceLabel}
                              </span>
                            )}
                          </p>
                        ) : (
                          listing.priceLabel && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {listing.priceLabel}
                            </p>
                          )
                        )}

                        {/* Location */}
                        {listing.location && (
                          <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <span className="line-clamp-1">{listing.location}</span>
                          </div>
                        )}

                        {/* Category + Time */}
                        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            <span>{listing.category?.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>
                              {formatDistanceToNow(new Date(listing.createdAt), {
                                addSuffix: true,
                                locale: he,
                              })}
                            </span>
                          </div>
                        </div>

                        {/* View count */}
                        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                          <Eye className="h-3 w-3" />
                          <span>{listing.viewCount} צפיות</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>

              {/* Load More */}
              {hasNextPage && (
                <div className="flex justify-center pt-6">
                  <Button
                    variant="outline"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? <Spinner size="sm" /> : 'טען עוד'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

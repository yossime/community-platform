'use client';

import Link from 'next/link';
import { Star, ChevronLeft } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Button } from '@platform/ui/src/components/button';
import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import { Spinner } from '@platform/ui/src/components/spinner';
import { Separator } from '@platform/ui/src/components/separator';

import { trpc } from '@/lib/trpc';
import { FreelancerProfileCard } from '@/components/marketplace/freelancer-profile-card';

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < Math.round(rating)
              ? 'fill-amber-400 text-amber-400'
              : 'text-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  );
}

interface FreelancerProfilePageProps {
  userSlug: string;
}

export function FreelancerProfilePage({ userSlug }: FreelancerProfilePageProps) {
  const { data, isLoading, error } = trpc.marketplace.getFreelancerProfile.useQuery({
    userSlug,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-destructive/10 p-4 text-center text-sm text-destructive">
          {error?.message ?? 'פרופיל הפרילנסר לא נמצא'}
        </div>
        <div className="text-center">
          <Button variant="outline" asChild>
            <Link href="/marketplace">
              <ChevronLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              חזור לשוק
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/marketplace" className="hover:text-foreground">
          שוק פרילנסרים
        </Link>
        <span>/</span>
        <span>פרילנסרים</span>
        <span>/</span>
        <span className="line-clamp-1">{data.user.displayName}</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2">
          <FreelancerProfileCard profile={data} />
        </div>

        {/* Sidebar: Reviews */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-rubik text-base">
                ביקורות ({data.reviews.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.reviews.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">
                  אין ביקורות עדיין
                </p>
              ) : (
                <div className="space-y-4">
                  {data.reviews.map((review) => (
                    <div key={review.id}>
                      <div className="flex items-start gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {review.reviewer.displayName?.slice(0, 2) ?? '??'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {review.reviewer.displayName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(review.createdAt).toLocaleDateString('he-IL')}
                            </span>
                          </div>
                          <div className="mt-1">
                            <StarRating rating={review.rating} />
                          </div>
                          {review.project && (
                            <Link
                              href={`/marketplace/${review.project.slug}`}
                              className="mt-1 block text-xs text-primary hover:underline"
                            >
                              {review.project.title}
                            </Link>
                          )}
                          {review.comment && (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {review.comment}
                            </p>
                          )}

                          {/* Sub-ratings */}
                          {(review.communicationRating ||
                            review.qualityRating ||
                            review.timelinessRating) && (
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                              {review.communicationRating && (
                                <span>
                                  תקשורת: {review.communicationRating}/5
                                </span>
                              )}
                              {review.qualityRating && (
                                <span>
                                  איכות: {review.qualityRating}/5
                                </span>
                              )}
                              {review.timelinessRating && (
                                <span>
                                  עמידה בלו&quot;ז: {review.timelinessRating}/5
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <Separator className="mt-4" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

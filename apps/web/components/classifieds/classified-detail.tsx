'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  Newspaper,
  MapPin,
  Heart,
  Eye,
  Phone,
  Mail,
  Tag,
  Clock,
  Trash2,
  Share2,
  ChevronLeft,
  Image,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Button } from '@platform/ui/src/components/button';
import { Badge } from '@platform/ui/src/components/badge';
import { Spinner } from '@platform/ui/src/components/spinner';
import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@platform/ui/src/components/dialog';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@platform/ui/src/hooks/use-toast';

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

interface ClassifiedDetailProps {
  slug: string;
}

export function ClassifiedDetail({ slug }: ClassifiedDetailProps) {
  const { user } = useAuth();
  const router = useRouter();
  const utils = trpc.useUtils();

  const [showContact, setShowContact] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const { data: listing, isLoading, error } = trpc.classified.getBySlug.useQuery({ slug });

  const { data: favData } = trpc.classified.isFavorited.useQuery(
    { listingId: listing?.id ?? '' },
    { enabled: !!user && !!listing },
  );

  const toggleFavorite = trpc.classified.toggleFavorite.useMutation({
    onSuccess: () => {
      if (listing) {
        utils.classified.isFavorited.invalidate({ listingId: listing.id });
      }
    },
  });

  const deleteListing = trpc.classified.delete.useMutation({
    onSuccess: () => {
      toast({ title: 'המודעה נמחקה', variant: 'success' });
      router.push('/classifieds');
    },
    onError: () => {
      toast({ title: 'שגיאה', description: 'לא ניתן למחוק את המודעה', variant: 'destructive' });
    },
  });

  const isOwner = user && listing && user.id === listing.authorId;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-destructive/10 p-4 text-center text-sm text-destructive">
          {error?.message ?? 'המודעה לא נמצאה'}
        </div>
        <div className="text-center">
          <Button variant="outline" asChild>
            <Link href="/classifieds">
              <ChevronLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              חזרה ללוח מודעות
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const hasImages = listing.images && listing.images.length > 0;

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: listing.title, url });
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast({ title: 'הקישור הועתק', variant: 'success' });
    }
  };

  const handleDelete = () => {
    if (window.confirm('האם אתה בטוח שברצונך למחוק מודעה זו?')) {
      deleteListing.mutate({ id: listing.id });
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/classifieds" className="hover:text-foreground">
          לוח מודעות
        </Link>
        <span>/</span>
        {listing.category && (
          <>
            <span>{listing.category.name}</span>
            <span>/</span>
          </>
        )}
        <span className="text-foreground line-clamp-1">{listing.title}</span>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Main Content */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* Image Gallery */}
          <Card>
            <CardContent className="p-0">
              {hasImages ? (
                <div>
                  {/* Main Image */}
                  <div className="relative aspect-[16/10] overflow-hidden rounded-t-lg bg-muted">
                    <img
                      src={listing.images[selectedImageIndex]}
                      alt={`${listing.title} - תמונה ${selectedImageIndex + 1}`}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  {/* Thumbnail Row */}
                  {listing.images.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto p-4">
                      {listing.images.map((imageUrl: string, index: number) => (
                        <button
                          key={index}
                          onClick={() => setSelectedImageIndex(index)}
                          className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 ${
                            index === selectedImageIndex
                              ? 'border-primary'
                              : 'border-transparent'
                          }`}
                        >
                          <img
                            src={imageUrl}
                            alt={`תמונה ${index + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex aspect-[16/10] items-center justify-center rounded-t-lg bg-muted">
                  <div className="text-center">
                    <Image className="mx-auto h-16 w-16 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">אין תמונות</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Listing Info */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              {/* Type Badge + Featured */}
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border-transparent px-2.5 py-0.5 text-xs font-semibold ${
                    TYPE_COLORS[listing.type] ?? ''
                  }`}
                >
                  {TYPE_LABELS[listing.type] ?? listing.type}
                </span>
                {listing.isFeatured && (
                  <Badge className="bg-amber-500 text-white hover:bg-amber-600">
                    מודעה מקודמת
                  </Badge>
                )}
              </div>

              {/* Title */}
              <h1 className="font-rubik text-2xl font-bold">{listing.title}</h1>

              {/* Price */}
              {listing.priceAgorot ? (
                <p className="font-rubik text-2xl font-bold text-primary">
                  {formatPrice(listing.priceAgorot)}
                  {listing.priceLabel && (
                    <span className="ms-2 text-base font-normal text-muted-foreground">
                      {listing.priceLabel}
                    </span>
                  )}
                </p>
              ) : (
                listing.priceLabel && (
                  <p className="text-lg text-muted-foreground">{listing.priceLabel}</p>
                )
              )}

              {/* Meta Info */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                {listing.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    <span>{listing.location}</span>
                  </div>
                )}
                {listing.category && (
                  <div className="flex items-center gap-1">
                    <Tag className="h-4 w-4" />
                    <span>{listing.category.name}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>
                    {formatDistanceToNow(new Date(listing.createdAt), {
                      addSuffix: true,
                      locale: he,
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  <span>{listing.viewCount} צפיות</span>
                </div>
              </div>

              {/* Divider */}
              <div className="border-b" />

              {/* Description */}
              <div>
                <h2 className="font-rubik text-lg font-semibold">תיאור</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  {listing.description}
                </p>
              </div>

              {/* Expiry Info */}
              {listing.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  המודעה פעילה עד{' '}
                  {new Date(listing.expiresAt).toLocaleDateString('he-IL', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="w-full shrink-0 space-y-4 lg:w-80">
          {/* Action Buttons */}
          <Card>
            <CardContent className="space-y-3 pt-6">
              {/* Contact Info */}
              {!showContact ? (
                <Button
                  className="w-full"
                  onClick={() => setShowContact(true)}
                >
                  <Phone className="me-2 h-4 w-4" />
                  הצג פרטי קשר
                </Button>
              ) : (
                <div className="space-y-3 rounded-md border p-4">
                  <h3 className="font-rubik text-sm font-semibold">פרטי קשר</h3>
                  {listing.contactPhone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={`tel:${listing.contactPhone}`}
                        className="text-primary hover:underline"
                        dir="ltr"
                      >
                        {listing.contactPhone}
                      </a>
                    </div>
                  )}
                  {listing.contactEmail && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={`mailto:${listing.contactEmail}`}
                        className="text-primary hover:underline"
                        dir="ltr"
                      >
                        {listing.contactEmail}
                      </a>
                    </div>
                  )}
                  {!listing.contactPhone && !listing.contactEmail && (
                    <p className="text-sm text-muted-foreground">
                      לא צוינו פרטי קשר
                    </p>
                  )}
                </div>
              )}

              {/* Favorite Button */}
              {user && !isOwner && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => toggleFavorite.mutate({ listingId: listing.id })}
                  disabled={toggleFavorite.isPending}
                >
                  <Heart
                    className={`me-2 h-4 w-4 ${
                      favData?.favorited
                        ? 'fill-red-500 text-red-500'
                        : ''
                    }`}
                  />
                  {favData?.favorited ? 'הסר מהמועדפים' : 'הוסף למועדפים'}
                </Button>
              )}

              {/* Share Button */}
              <Button variant="outline" className="w-full" onClick={handleShare}>
                <Share2 className="me-2 h-4 w-4" />
                שתף מודעה
              </Button>

              {/* Owner Actions */}
              {isOwner && (
                <>
                  <div className="border-b" />
                  <Button variant="outline" className="w-full" asChild>
                    <Link href={`/classifieds/${slug}/edit`}>
                      ערוך מודעה
                    </Link>
                  </Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="destructive" className="w-full">
                        <Trash2 className="me-2 h-4 w-4" />
                        מחק מודעה
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="font-rubik">מחיקת מודעה</DialogTitle>
                      </DialogHeader>
                      <p className="text-sm text-muted-foreground">
                        האם אתה בטוח שברצונך למחוק מודעה זו? פעולה זו אינה הפיכה.
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="destructive"
                          onClick={handleDelete}
                          disabled={deleteListing.isPending}
                        >
                          {deleteListing.isPending ? (
                            <Spinner size="sm" />
                          ) : (
                            'מחק'
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </CardContent>
          </Card>

          {/* Author Card */}
          {listing.author && (
            <Card>
              <CardHeader>
                <CardTitle className="font-rubik text-base">מפרסם המודעה</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="text-sm">
                      {listing.author.displayName?.slice(0, 2) ?? '??'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Link
                      href={`/directory/${listing.author.slug}`}
                      className="font-medium hover:text-primary"
                    >
                      {listing.author.displayName}
                    </Link>
                    {listing.author.createdAt && (
                      <p className="text-xs text-muted-foreground">
                        חבר/ה מאז{' '}
                        {new Date(listing.author.createdAt).toLocaleDateString('he-IL', {
                          year: 'numeric',
                          month: 'long',
                        })}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Back Button */}
          <Button variant="ghost" className="w-full" asChild>
            <Link href="/classifieds">
              <ChevronLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              חזרה ללוח מודעות
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

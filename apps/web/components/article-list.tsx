'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, Eye, Heart, MessageSquare, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';

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

export function ArticleList() {
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'editors_pick'>('newest');
  const [categorySlug, setCategorySlug] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data: categories } = trpc.article.getCategories.useQuery();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.article.list.useInfiniteQuery(
      {
        limit: 12,
        sortBy,
        categorySlug: categorySlug !== 'all' ? categorySlug : undefined,
        search: search || undefined,
      },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    );

  const articles = data?.pages.flatMap((page) => page.articles) ?? [];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <Input
            placeholder="חיפוש מאמרים..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {categories && categories.length > 0 && (
          <Select value={categorySlug} onValueChange={setCategorySlug}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="קטגוריה" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הקטגוריות</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.slug}>
                  {cat.name} ({cat._count.articles})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="מיון" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">חדש ביותר</SelectItem>
            <SelectItem value="popular">פופולרי</SelectItem>
            <SelectItem value="editors_pick">בחירת העורכים</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Article Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : articles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-rubik text-lg font-semibold">אין מאמרים</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {search ? 'לא נמצאו מאמרים התואמים לחיפוש' : 'עדיין לא פורסמו מאמרים'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <Link key={article.id} href={`/articles/${article.slug}`}>
                <Card className="group h-full overflow-hidden transition-shadow hover:shadow-md">
                  {/* Cover Image */}
                  <div className="relative aspect-[16/9] bg-muted">
                    {article.coverImageUrl ? (
                      <Image
                        src={article.coverImageUrl}
                        alt={article.title}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <BookOpen className="h-12 w-12 text-muted-foreground/50" />
                      </div>
                    )}
                    {article.isEditorsPick && (
                      <div className="absolute start-3 top-3">
                        <Badge variant="default">בחירת העורכים</Badge>
                      </div>
                    )}
                  </div>

                  <CardContent className="p-4">
                    {/* Category */}
                    {article.category && (
                      <Badge variant="outline" className="mb-2">
                        {article.category.name}
                      </Badge>
                    )}

                    <h3 className="font-rubik text-base font-semibold leading-tight line-clamp-2">
                      {article.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {article.excerpt}
                    </p>

                    {/* Author & Meta */}
                    <div className="mt-3 flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={article.author.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {article.author.displayName?.charAt(0) ?? '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">
                        {article.author.displayName}
                      </span>
                      {article.publishedAt && (
                        <>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(article.publishedAt), {
                              locale: he,
                              addSuffix: true,
                            })}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        {article.viewCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5" />
                        {article.likeCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {article.commentCount}
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
                טען עוד מאמרים
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

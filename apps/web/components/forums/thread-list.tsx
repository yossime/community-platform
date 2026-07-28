'use client';

import Link from 'next/link';
import { MessageSquare, Pin, Plus } from 'lucide-react';

import { Card, CardContent } from '@platform/ui/src/components/card';
import { Button } from '@platform/ui/src/components/button';
import { Badge } from '@platform/ui/src/components/badge';
import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import { Spinner } from '@platform/ui/src/components/spinner';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';

interface ThreadListProps {
  forumSlug: string;
}

export function ThreadList({ forumSlug }: ThreadListProps) {
  const { user } = useAuth();
  const { data: forum, isLoading: forumLoading } = trpc.forum.getById.useQuery({ slug: forumSlug });
  const { data, isLoading: threadsLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.thread.list.useInfiniteQuery(
      { forumSlug, limit: 20 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    );

  const isLoading = forumLoading || threadsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!forum) {
    return (
      <div className="rounded-md bg-destructive/10 p-4 text-center text-sm text-destructive">
        הפורום לא נמצא
      </div>
    );
  }

  const allThreads = data?.pages.flatMap((page) => page.threads) ?? [];

  return (
    <div className="space-y-6">
      {/* Forum Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/forums" className="hover:text-foreground">
              פורומים
            </Link>
            <span>/</span>
            {forum.category && <span>{forum.category.name}</span>}
          </div>
          <h1 className="mt-1 font-rubik text-3xl font-bold">{forum.name}</h1>
          {forum.description && (
            <p className="mt-2 text-muted-foreground">{forum.description}</p>
          )}
        </div>
        {user && (
          <Button asChild>
            <Link href={`/forums/${forumSlug}/new`}>
              <Plus className="me-2 h-4 w-4" />
              נושא חדש
            </Link>
          </Button>
        )}
      </div>

      {/* Thread List */}
      {allThreads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-rubik text-lg font-semibold">אין נושאים עדיין</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              היה הראשון לפתוח דיון בפורום זה
            </p>
            {user && (
              <Button className="mt-4" asChild>
                <Link href={`/forums/${forumSlug}/new`}>פתח נושא חדש</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {allThreads.map((thread) => (
            <Card key={thread.id} className="transition-colors hover:bg-accent/30">
              <CardContent className="flex items-center gap-4 py-4">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-xs">
                    {thread.author.displayName?.slice(0, 2) ?? '??'}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {thread.isPinned && (
                      <Pin className="h-3 w-3 shrink-0 text-primary" />
                    )}
                    <Link
                      href={`/forums/${forumSlug}/${thread.slug}`}
                      className="font-medium hover:text-primary line-clamp-1"
                    >
                      {thread.title}
                    </Link>
                    {thread.isLocked && (
                      <Badge variant="secondary" className="text-xs">
                        נעול
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{thread.author.displayName}</span>
                    <span>&middot;</span>
                    <span>
                      {new Date(thread.createdAt).toLocaleDateString('he-IL')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MessageSquare className="h-4 w-4" />
                  <span>{thread.postCount}</span>
                </div>
              </CardContent>
            </Card>
          ))}

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
      )}
    </div>
  );
}

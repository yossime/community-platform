'use client';

import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import { Card, CardContent } from '@platform/ui/src/components/card';
import { Button } from '@platform/ui/src/components/button';
import { Spinner } from '@platform/ui/src/components/spinner';

import { trpc } from '@/lib/trpc';

interface PostListProps {
  threadId: string;
}

export function PostList({ threadId }: PostListProps) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.post.listByThread.useInfiniteQuery(
      { threadId, limit: 20 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  const allPosts = data?.pages.flatMap((page) => page.posts) ?? [];

  if (allPosts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        עדיין אין תגובות. היה הראשון להגיב!
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {allPosts.map((post) => (
        <Card key={post.id}>
          <CardContent className="py-4">
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">
                  {post.author.displayName?.slice(0, 2) ?? '??'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{post.author.displayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(post.createdAt).toLocaleDateString('he-IL', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="mt-2 text-sm">{post.content}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? <Spinner size="sm" /> : 'טען עוד תגובות'}
          </Button>
        </div>
      )}
    </div>
  );
}

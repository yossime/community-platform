'use client';

import Link from 'next/link';
import { Eye, MessageSquare } from 'lucide-react';

import { Card, CardContent } from '@platform/ui/src/components/card';
import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import { Badge } from '@platform/ui/src/components/badge';
import { Button } from '@platform/ui/src/components/button';
import { Separator } from '@platform/ui/src/components/separator';
import { Spinner } from '@platform/ui/src/components/spinner';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import { PostList } from './post-list';
import { CreatePostForm } from './create-post-form';

interface ThreadViewProps {
  forumSlug: string;
  threadSlug: string;
}

export function ThreadView({ forumSlug, threadSlug }: ThreadViewProps) {
  const { user } = useAuth();
  const { data: thread, isLoading } = trpc.thread.getBySlug.useQuery({ slug: threadSlug });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="rounded-md bg-destructive/10 p-4 text-center text-sm text-destructive">
        הנושא לא נמצא
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/forums" className="hover:text-foreground">
          פורומים
        </Link>
        <span>/</span>
        <Link href={`/forums/${forumSlug}`} className="hover:text-foreground">
          {thread.forum?.name}
        </Link>
      </div>

      {/* Thread Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-rubik text-2xl font-bold">{thread.title}</h1>
          {thread.status === 'LOCKED' && (
            <Badge variant="secondary">נעול</Badge>
          )}
          {thread.status === 'CLOSED' && (
            <Badge variant="secondary">סגור</Badge>
          )}
        </div>
        <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-[10px]">
                {thread.author.displayName?.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <span>{thread.author.displayName}</span>
          </div>
          <span>{new Date(thread.createdAt).toLocaleDateString('he-IL')}</span>
          <div className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            <span>{thread.viewCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            <span>{thread.postCount}</span>
          </div>
        </div>
      </div>

      {/* Thread Content */}
      <Card>
        <CardContent className="pt-6">
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dir="rtl"
          >
            {thread.content}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Posts */}
      <div>
        <h2 className="font-rubik text-lg font-semibold">
          תגובות ({thread.postCount})
        </h2>
        <PostList threadId={thread.id} />
      </div>

      {/* Reply Form */}
      {user && thread.status !== 'LOCKED' && thread.status !== 'CLOSED' && (
        <>
          <Separator />
          <CreatePostForm threadId={thread.id} />
        </>
      )}
    </div>
  );
}

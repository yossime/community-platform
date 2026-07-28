'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, Heart, Eye, MessageSquare, ArrowRight, Share2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';

import { Button } from '@platform/ui/src/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Badge } from '@platform/ui/src/components/badge';
import { Spinner } from '@platform/ui/src/components/spinner';
import { Avatar, AvatarFallback, AvatarImage } from '@platform/ui/src/components/avatar';
import { Separator } from '@platform/ui/src/components/separator';
import { Textarea } from '@platform/ui/src/components/textarea';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';

export function ArticleDetail({ slug }: { slug: string }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: article, isLoading } = trpc.article.getBySlug.useQuery({ slug });
  const { data: likeData } = trpc.article.isLiked.useQuery(
    { articleId: article?.id ?? '' },
    { enabled: !!article?.id && !!user },
  );

  const toggleLike = trpc.article.toggleLike.useMutation({
    onSuccess: () => {
      utils.article.getBySlug.invalidate({ slug });
      utils.article.isLiked.invalidate({ articleId: article?.id ?? '' });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!article) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 font-rubik text-lg font-semibold">המאמר לא נמצא</h3>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/articles"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="h-4 w-4" />
        חזרה למאמרים
      </Link>

      {/* Header */}
      <article className="mx-auto max-w-3xl">
        {/* Category */}
        {article.category && (
          <Link href={`/articles?category=${article.category.slug}`}>
            <Badge variant="outline" className="mb-3">
              {article.category.name}
            </Badge>
          </Link>
        )}

        {article.isEditorsPick && (
          <Badge variant="default" className="mb-3 ms-2">
            בחירת העורכים
          </Badge>
        )}

        <h1 className="font-rubik text-3xl font-bold leading-tight md:text-4xl">{article.title}</h1>

        {/* Author & Meta */}
        <div className="mt-4 flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={article.author.avatarUrl ?? undefined} />
            <AvatarFallback>{article.author.displayName?.charAt(0) ?? '?'}</AvatarFallback>
          </Avatar>
          <div>
            <Link href={`/directory/${article.author.slug}`} className="text-sm font-medium hover:underline">
              {article.author.displayName}
            </Link>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {article.publishedAt && (
                <span>
                  {formatDistanceToNow(new Date(article.publishedAt), { locale: he, addSuffix: true })}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" /> {article.viewCount} צפיות
              </span>
            </div>
          </div>
        </div>

        {/* Cover Image */}
        {article.coverImageUrl && (
          <div className="relative mt-6 aspect-[2/1] overflow-hidden rounded-lg">
            <Image src={article.coverImageUrl} alt={article.title} fill className="object-cover" />
          </div>
        )}

        <Separator className="my-6" />

        {/* Content */}
        <div className="prose prose-lg max-w-none whitespace-pre-wrap leading-relaxed">
          {article.content}
        </div>

        <Separator className="my-6" />

        {/* Actions */}
        <div className="flex items-center gap-4">
          <Button
            variant={likeData?.liked ? 'default' : 'outline'}
            size="sm"
            onClick={() => article && toggleLike.mutate({ articleId: article.id })}
            disabled={!user || toggleLike.isPending}
          >
            <Heart className={`me-1 h-4 w-4 ${likeData?.liked ? 'fill-current' : ''}`} />
            {article.likeCount}
          </Button>

          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            {article.commentCount} תגובות
          </span>

          <Button
            variant="ghost"
            size="sm"
            className="ms-auto"
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: article.title, url: window.location.href });
              }
            }}
          >
            <Share2 className="me-1 h-4 w-4" />
            שתף
          </Button>
        </div>

        <Separator className="my-6" />

        {/* Comments */}
        <div className="space-y-4">
          <h2 className="font-rubik text-xl font-bold">
            תגובות ({article.comments.length})
          </h2>

          {/* Add Comment */}
          {user && <AddCommentForm articleId={article.id} slug={slug} />}

          {/* Comment List */}
          {article.comments.map((comment) => (
            <CommentCard key={comment.id} comment={comment} articleId={article.id} slug={slug} />
          ))}
        </div>
      </article>
    </div>
  );
}

function AddCommentForm({
  articleId,
  slug,
  parentId,
  onDone,
}: {
  articleId: string;
  slug: string;
  parentId?: string;
  onDone?: () => void;
}) {
  const utils = trpc.useUtils();
  const [content, setContent] = useState('');

  const addComment = trpc.article.addComment.useMutation({
    onSuccess: () => {
      utils.article.getBySlug.invalidate({ slug });
      setContent('');
      onDone?.();
    },
  });

  return (
    <div className="space-y-2">
      <Textarea
        placeholder={parentId ? 'כתוב תגובה...' : 'שתף את דעתך על המאמר...'}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={parentId ? 2 : 3}
      />
      <div className="flex justify-end gap-2">
        {parentId && onDone && (
          <Button variant="ghost" size="sm" onClick={onDone}>
            ביטול
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => addComment.mutate({ articleId, content, parentId })}
          disabled={!content.trim() || addComment.isPending}
        >
          {addComment.isPending ? <Spinner className="me-2" /> : null}
          שלח תגובה
        </Button>
      </div>
    </div>
  );
}

function CommentCard({
  comment,
  articleId,
  slug,
}: {
  comment: {
    id: string;
    content: string;
    createdAt: Date;
    author: { id: string; displayName: string; slug: string; avatarUrl: string | null };
    children?: Array<{
      id: string;
      content: string;
      createdAt: Date;
      author: { id: string; displayName: string; slug: string; avatarUrl: string | null };
    }>;
  };
  articleId: string;
  slug: string;
}) {
  const { user } = useAuth();
  const [showReply, setShowReply] = useState(false);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarImage src={comment.author.avatarUrl ?? undefined} />
            <AvatarFallback className="text-xs">
              {comment.author.displayName?.charAt(0) ?? '?'}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{comment.author.displayName}</span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(comment.createdAt), { locale: he, addSuffix: true })}
          </span>
        </div>
        <p className="mt-2 text-sm whitespace-pre-wrap">{comment.content}</p>

        {user && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 text-xs"
            onClick={() => setShowReply(!showReply)}
          >
            הגב
          </Button>
        )}

        {showReply && (
          <div className="mt-2 ps-4 border-s-2">
            <AddCommentForm
              articleId={articleId}
              slug={slug}
              parentId={comment.id}
              onDone={() => setShowReply(false)}
            />
          </div>
        )}

        {/* Replies */}
        {comment.children && comment.children.length > 0 && (
          <div className="mt-3 space-y-3 ps-4 border-s-2">
            {comment.children.map((reply) => (
              <div key={reply.id}>
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={reply.author.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {reply.author.displayName?.charAt(0) ?? '?'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{reply.author.displayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(reply.createdAt), { locale: he, addSuffix: true })}
                  </span>
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap">{reply.content}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

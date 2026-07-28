'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';

import { Card, CardContent } from '@platform/ui/src/components/card';
import { Button } from '@platform/ui/src/components/button';
import { Textarea } from '@platform/ui/src/components/textarea';
import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import { Separator } from '@platform/ui/src/components/separator';
import { Spinner } from '@platform/ui/src/components/spinner';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@platform/ui/src/hooks/use-toast';

interface Author {
  id: string;
  displayName: string | null;
  slug: string;
  avatarUrl: string | null;
}

interface Comment {
  id: string;
  content: string;
  createdAt: Date | string;
  author: Author;
  children?: Comment[];
}

interface PortfolioCommentsProps {
  projectId: string;
  comments: Comment[];
}

export function PortfolioComments({ projectId, comments }: PortfolioCommentsProps) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const utils = trpc.useUtils();

  const addComment = trpc.portfolio.addComment.useMutation({
    onSuccess: () => {
      setContent('');
      setReplyingTo(null);
      setReplyContent('');
      utils.portfolio.getProject.invalidate();
      toast({
        title: 'התגובה נשלחה',
        description: 'התגובה ממתינה לאישור מנהל',
        variant: 'success',
      });
    },
    onError: () => {
      toast({
        title: 'שגיאה',
        description: 'לא ניתן לשלוח את התגובה. נסה שוב.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim().length < 2) return;
    addComment.mutate({
      projectId,
      content: content.trim(),
    });
  };

  const handleSubmitReply = (e: React.FormEvent, parentId: string) => {
    e.preventDefault();
    if (replyContent.trim().length < 2) return;
    addComment.mutate({
      projectId,
      content: replyContent.trim(),
      parentId,
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="font-rubik text-lg font-semibold">
        <MessageCircle className="me-2 inline-block h-5 w-5" />
        תגובות ({comments.length})
      </h2>

      {/* Comment List */}
      {comments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              אין תגובות עדיין. היה הראשון להגיב!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="space-y-3">
              {/* Parent Comment */}
              <CommentItem
                comment={comment}
                onReply={() =>
                  setReplyingTo(replyingTo === comment.id ? null : comment.id)
                }
                canReply={!!user}
              />

              {/* Children (nested replies - 1 level) */}
              {comment.children && comment.children.length > 0 && (
                <div className="ms-8 space-y-3 border-s-2 border-muted ps-4">
                  {comment.children.map((child) => (
                    <CommentItem
                      key={child.id}
                      comment={child}
                      isReply
                    />
                  ))}
                </div>
              )}

              {/* Reply Form */}
              {replyingTo === comment.id && user && (
                <div className="ms-8 border-s-2 border-primary/30 ps-4">
                  <form
                    onSubmit={(e) => handleSubmitReply(e, comment.id)}
                    className="space-y-3"
                  >
                    <Textarea
                      placeholder={`תגובה ל${comment.author.displayName ?? 'משתמש'}...`}
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      rows={2}
                      disabled={addComment.isPending}
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyContent('');
                        }}
                      >
                        ביטול
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={addComment.isPending || replyContent.trim().length < 2}
                      >
                        {addComment.isPending ? (
                          <Spinner size="sm" className="text-primary-foreground" />
                        ) : (
                          'שלח תגובה'
                        )}
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Separator />

      {/* Add Comment Form */}
      {user ? (
        <form onSubmit={handleSubmitComment} className="space-y-4">
          <h3 className="font-rubik text-base font-semibold">הוסף תגובה</h3>
          <Textarea
            placeholder="כתוב את תגובתך על הפרויקט..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            disabled={addComment.isPending}
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={addComment.isPending || content.trim().length < 2}
            >
              {addComment.isPending ? (
                <Spinner size="sm" className="text-primary-foreground" />
              ) : (
                'שלח תגובה'
              )}
            </Button>
          </div>
        </form>
      ) : (
        <Card>
          <CardContent className="py-4 text-center text-sm text-muted-foreground">
            <a href="/login" className="text-primary hover:underline">
              התחבר
            </a>{' '}
            כדי להגיב על הפרויקט
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Single Comment ─────────────────────────────────────

interface CommentItemProps {
  comment: Comment;
  isReply?: boolean;
  canReply?: boolean;
  onReply?: () => void;
}

function CommentItem({ comment, isReply, canReply, onReply }: CommentItemProps) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          <Avatar className={isReply ? 'h-7 w-7' : 'h-8 w-8'}>
            <AvatarFallback className={isReply ? 'text-[9px]' : 'text-[10px]'}>
              {comment.author.displayName?.slice(0, 2) ?? '??'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{comment.author.displayName}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(comment.createdAt).toLocaleDateString('he-IL')}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{comment.content}</p>
            {canReply && onReply && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onReply}
                className="mt-1 h-auto px-0 py-0 text-xs text-muted-foreground hover:text-foreground"
              >
                הגב
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

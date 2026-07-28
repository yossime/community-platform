'use client';

import { useState } from 'react';

import { Button } from '@platform/ui/src/components/button';
import { Textarea } from '@platform/ui/src/components/textarea';
import { Spinner } from '@platform/ui/src/components/spinner';

import { trpc } from '@/lib/trpc';
import { toast } from '@platform/ui/src/hooks/use-toast';

interface CreatePostFormProps {
  threadId: string;
}

export function CreatePostForm({ threadId }: CreatePostFormProps) {
  const [content, setContent] = useState('');
  const utils = trpc.useUtils();

  const createPost = trpc.post.create.useMutation({
    onSuccess: () => {
      setContent('');
      utils.post.listByThread.invalidate({ threadId });
      toast({ title: 'התגובה נשלחה', description: 'התגובה ממתינה לאישור מנהל', variant: 'success' });
    },
    onError: () => {
      toast({ title: 'שגיאה', description: 'לא ניתן לשלוח את התגובה. נסה שוב', variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim().length < 1) return;
    createPost.mutate({ threadId, content: content.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="font-rubik text-lg font-semibold">הוסף תגובה</h3>
      <Textarea
        placeholder="כתוב את תגובתך..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        disabled={createPost.isPending}
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={createPost.isPending || content.trim().length < 1}>
          {createPost.isPending ? <Spinner size="sm" className="text-primary-foreground" /> : 'שלח תגובה'}
        </Button>
      </div>
    </form>
  );
}

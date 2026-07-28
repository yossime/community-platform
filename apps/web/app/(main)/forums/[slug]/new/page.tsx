'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@platform/ui/src/components/button';
import { Input } from '@platform/ui/src/components/input';
import { Label } from '@platform/ui/src/components/label';
import { Textarea } from '@platform/ui/src/components/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@platform/ui/src/components/select';
import { Spinner } from '@platform/ui/src/components/spinner';
import { toast } from '@platform/ui/src/hooks/use-toast';

import { trpc } from '@/lib/trpc';

interface NewThreadPageProps {
  params: { slug: string };
}

export default function NewThreadPage({ params }: NewThreadPageProps) {
  const router = useRouter();
  const { data: forum } = trpc.forum.getById.useQuery({ slug: params.slug });

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'FLAT' | 'THREADED' | 'QA'>('FLAT');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createThread = trpc.thread.create.useMutation({
    onSuccess: (thread) => {
      toast({ title: 'הנושא נוצר', description: 'הנושא ממתין לאישור מנהל', variant: 'success' });
      router.push(`/forums/${params.slug}`);
    },
    onError: (err) => {
      toast({ title: 'שגיאה', description: 'לא ניתן ליצור נושא. נסה שוב', variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (title.trim().length < 3) newErrors.title = 'כותרת חייבת להכיל לפחות 3 תווים';
    if (content.trim().length < 10) newErrors.content = 'תוכן חייב להכיל לפחות 10 תווים';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (!forum) return;

    createThread.mutate({
      forumId: forum.id,
      title: title.trim(),
      content: content.trim(),
      format,
    });
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/forums" className="hover:text-foreground">
          פורומים
        </Link>
        <span>/</span>
        <Link href={`/forums/${params.slug}`} className="hover:text-foreground">
          {forum?.name ?? params.slug}
        </Link>
        <span>/</span>
        <span>נושא חדש</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-rubik">נושא חדש</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">כותרת</Label>
              <Input
                id="title"
                placeholder="כתוב כותרת ברורה ותמציתית"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setErrors((prev) => ({ ...prev, title: '' }));
                }}
                disabled={createThread.isPending}
              />
              {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="format">סוג דיון</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as typeof format)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FLAT">דיון רגיל</SelectItem>
                  <SelectItem value="THREADED">דיון מקונן</SelectItem>
                  <SelectItem value="QA">שאלה ותשובה</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">תוכן</Label>
              <Textarea
                id="content"
                placeholder="תאר את הנושא בפירוט..."
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setErrors((prev) => ({ ...prev, content: '' }));
                }}
                rows={8}
                disabled={createThread.isPending}
              />
              {errors.content && <p className="text-sm text-destructive">{errors.content}</p>}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                הנושא יפורסם לאחר אישור מנהל
              </p>
              <div className="flex gap-3">
                <Button variant="outline" type="button" asChild>
                  <Link href={`/forums/${params.slug}`}>ביטול</Link>
                </Button>
                <Button type="submit" disabled={createThread.isPending}>
                  {createThread.isPending ? (
                    <Spinner size="sm" className="text-primary-foreground" />
                  ) : (
                    'פרסם נושא'
                  )}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

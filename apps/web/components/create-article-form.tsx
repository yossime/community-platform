'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen } from 'lucide-react';

import { Button } from '@platform/ui/src/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Input } from '@platform/ui/src/components/input';
import { Label } from '@platform/ui/src/components/label';
import { Textarea } from '@platform/ui/src/components/textarea';
import { Spinner } from '@platform/ui/src/components/spinner';
import { Switch } from '@platform/ui/src/components/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@platform/ui/src/components/select';

import { trpc } from '@/lib/trpc';
import { RichTextEditor } from './rich-text-editor';

export function CreateArticleForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [publishNow, setPublishNow] = useState(false);

  const { data: categories } = trpc.article.getCategories.useQuery();

  const createArticle = trpc.article.create.useMutation({
    onSuccess: (data) => {
      router.push(`/articles/${data.slug}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createArticle.mutate({
      title,
      content,
      excerpt,
      categoryId,
      coverImageUrl: coverImageUrl || undefined,
      metaTitle: metaTitle || undefined,
      metaDescription: metaDescription || undefined,
      publishNow,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-rubik">פרטי המאמר</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">כותרת *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="כותרת המאמר"
              required
              minLength={5}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="excerpt">תקציר *</Label>
            <Textarea
              id="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="תקציר קצר שיופיע בכרטיס המאמר"
              required
              minLength={10}
              maxLength={300}
              rows={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>קטגוריה *</Label>
              <Select value={categoryId} onValueChange={setCategoryId} required>
                <SelectTrigger>
                  <SelectValue placeholder="בחר קטגוריה" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="coverImageUrl">תמונת כיסוי (URL)</Label>
              <Input
                id="coverImageUrl"
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                placeholder="https://..."
                type="url"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>תוכן המאמר *</Label>
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="כתוב את תוכן המאמר כאן..."
            />
            <p className="text-xs text-muted-foreground">
              עורך טקסט עשיר — השתמש בסרגל הכלים לעיצוב
            </p>
          </div>
        </CardContent>
      </Card>

      {/* SEO */}
      <Card>
        <CardHeader>
          <CardTitle className="font-rubik text-base">SEO (אופציונלי)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="metaTitle">כותרת מטא</Label>
            <Input
              id="metaTitle"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="כותרת למנועי חיפוש (עד 60 תווים)"
              maxLength={60}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="metaDescription">תיאור מטא</Label>
            <Textarea
              id="metaDescription"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="תיאור למנועי חיפוש (עד 160 תווים)"
              maxLength={160}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch id="publishNow" checked={publishNow} onCheckedChange={setPublishNow} />
          <Label htmlFor="publishNow">פרסם מיד</Label>
        </div>

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            ביטול
          </Button>
          <Button type="submit" disabled={!categoryId || createArticle.isPending}>
            {createArticle.isPending ? <Spinner className="me-2" /> : null}
            <BookOpen className="me-2 h-4 w-4" />
            {publishNow ? 'פרסם מאמר' : 'שמור כטיוטה'}
          </Button>
        </div>
      </div>

      {createArticle.error && (
        <p className="text-sm text-destructive">{createArticle.error.message}</p>
      )}
    </form>
  );
}

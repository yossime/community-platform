'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Plus, Trash2, GripVertical } from 'lucide-react';

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

export function CreateCourseForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [level, setLevel] = useState<'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'>('BEGINNER');
  const [isFree, setIsFree] = useState(true);
  const [priceAgorot, setPriceAgorot] = useState(0);
  const [coverImageUrl, setCoverImageUrl] = useState('');

  const createCourse = trpc.course.create.useMutation({
    onSuccess: (data) => {
      router.push(`/courses/${data.slug}/manage`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createCourse.mutate({
      title,
      description,
      shortDescription,
      level,
      isFree,
      priceAgorot: isFree ? 0 : priceAgorot,
      coverImageUrl: coverImageUrl || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-rubik">פרטי הקורס</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">שם הקורס *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="לדוגמה: מבוא לעיצוב גרפי"
              required
              minLength={5}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shortDescription">תיאור קצר *</Label>
            <Input
              id="shortDescription"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              placeholder="תיאור קצר שיופיע בכרטיס הקורס"
              required
              minLength={10}
              maxLength={300}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">תיאור מלא *</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="תיאור מפורט של הקורס, למה ללמוד אותו, מה תלמדו..."
              required
              minLength={50}
              rows={6}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>רמה</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as typeof level)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BEGINNER">מתחילים</SelectItem>
                  <SelectItem value="INTERMEDIATE">בינוני</SelectItem>
                  <SelectItem value="ADVANCED">מתקדם</SelectItem>
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

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="isFree" checked={isFree} onCheckedChange={setIsFree} />
              <Label htmlFor="isFree">קורס חינמי</Label>
            </div>

            {!isFree && (
              <div className="flex items-center gap-2">
                <Label htmlFor="price">מחיר (₪)</Label>
                <Input
                  id="price"
                  type="number"
                  min={1}
                  value={priceAgorot / 100}
                  onChange={(e) => setPriceAgorot(Math.round(Number(e.target.value) * 100))}
                  className="w-24"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          ביטול
        </Button>
        <Button type="submit" disabled={createCourse.isPending}>
          {createCourse.isPending ? <Spinner className="me-2" /> : null}
          <GraduationCap className="me-2 h-4 w-4" />
          צור קורס
        </Button>
      </div>

      {createCourse.error && (
        <p className="text-sm text-destructive">{createCourse.error.message}</p>
      )}
    </form>
  );
}

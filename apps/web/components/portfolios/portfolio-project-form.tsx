'use client';

import { useState } from 'react';

import { Button } from '@platform/ui/src/components/button';
import { Input } from '@platform/ui/src/components/input';
import { Label } from '@platform/ui/src/components/label';
import { Textarea } from '@platform/ui/src/components/textarea';
import { Spinner } from '@platform/ui/src/components/spinner';

import { trpc } from '@/lib/trpc';
import { toast } from '@platform/ui/src/hooks/use-toast';

const CATEGORY_OPTIONS = [
  { value: '', label: 'בחר קטגוריה...' },
  { value: 'web-design', label: 'עיצוב אתרים' },
  { value: 'graphic-design', label: 'עיצוב גרפי' },
  { value: 'ui-ux', label: 'UI/UX' },
  { value: 'development', label: 'פיתוח' },
  { value: 'marketing', label: 'שיווק' },
  { value: 'video', label: 'וידאו' },
  { value: 'photography', label: 'צילום' },
  { value: 'other', label: 'אחר' },
];

interface PortfolioProjectFormProps {
  project?: {
    id: string;
    title: string;
    description: string;
    processNotes?: string | null;
    coverImageUrl: string;
    category?: string | null;
    tags: string[];
    tools: string[];
    completedAt?: Date | string | null;
  };
  onSuccess?: () => void;
}

export function PortfolioProjectForm({ project, onSuccess }: PortfolioProjectFormProps) {
  const isEditing = !!project;
  const utils = trpc.useUtils();

  const [title, setTitle] = useState(project?.title ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [processNotes, setProcessNotes] = useState(project?.processNotes ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState(project?.coverImageUrl ?? '');
  const [category, setCategory] = useState(project?.category ?? '');
  const [tagsInput, setTagsInput] = useState(project?.tags.join(', ') ?? '');
  const [toolsInput, setToolsInput] = useState(project?.tools.join(', ') ?? '');
  const [completedAt, setCompletedAt] = useState(
    project?.completedAt
      ? new Date(project.completedAt).toISOString().split('T')[0]
      : '',
  );

  const createProject = trpc.portfolio.createProject.useMutation({
    onSuccess: () => {
      toast({ title: 'הפרויקט נוצר בהצלחה', description: 'הפרויקט ממתין לאישור', variant: 'success' });
      utils.portfolio.myPortfolio.invalidate();
      utils.portfolio.explore.invalidate();
      onSuccess?.();
    },
    onError: (err) => {
      toast({
        title: 'שגיאה',
        description: err.message || 'לא ניתן ליצור את הפרויקט. נסה שוב.',
        variant: 'destructive',
      });
    },
  });

  const updateProject = trpc.portfolio.updateProject.useMutation({
    onSuccess: () => {
      toast({ title: 'הפרויקט עודכן בהצלחה', variant: 'success' });
      utils.portfolio.getProject.invalidate();
      utils.portfolio.myPortfolio.invalidate();
      utils.portfolio.explore.invalidate();
      onSuccess?.();
    },
    onError: (err) => {
      toast({
        title: 'שגיאה',
        description: err.message || 'לא ניתן לעדכן את הפרויקט. נסה שוב.',
        variant: 'destructive',
      });
    },
  });

  const isPending = createProject.isPending || updateProject.isPending;

  const parseTags = (input: string): string[] =>
    input
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const tags = parseTags(tagsInput);
    const tools = parseTags(toolsInput);

    if (isEditing) {
      updateProject.mutate({
        id: project.id,
        title,
        description,
        processNotes: processNotes || undefined,
        coverImageUrl,
        category: category || undefined,
        tags,
        tools,
      });
    } else {
      createProject.mutate({
        title,
        description,
        coverImageUrl,
        processNotes: processNotes || undefined,
        category: category || undefined,
        tags,
        tools,
        completedAt: completedAt ? new Date(completedAt) : undefined,
      });
    }
  };

  const isValid = title.trim().length >= 3 && description.trim().length >= 10 && coverImageUrl.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="project-title">כותרת הפרויקט *</Label>
        <Input
          id="project-title"
          placeholder="למשל: עיצוב מחדש של אתר חברת XYZ"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isPending}
          minLength={3}
          maxLength={200}
          required
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="project-description">תיאור הפרויקט *</Label>
        <Textarea
          id="project-description"
          placeholder="תאר את הפרויקט, את האתגרים ואת הפתרונות שיישמת..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isPending}
          rows={4}
          minLength={10}
          maxLength={5000}
          required
        />
        <p className="text-xs text-muted-foreground">
          {description.length}/5000
        </p>
      </div>

      {/* Process Notes */}
      <div className="space-y-2">
        <Label htmlFor="project-process">תהליך העבודה (אופציונלי)</Label>
        <Textarea
          id="project-process"
          placeholder="תאר את תהליך העבודה: מחקר, תכנון, ביצוע..."
          value={processNotes}
          onChange={(e) => setProcessNotes(e.target.value)}
          disabled={isPending}
          rows={3}
          maxLength={5000}
        />
      </div>

      {/* Cover Image URL */}
      <div className="space-y-2">
        <Label htmlFor="project-cover">כתובת תמונת כיסוי (URL) *</Label>
        <Input
          id="project-cover"
          type="url"
          placeholder="https://..."
          value={coverImageUrl}
          onChange={(e) => setCoverImageUrl(e.target.value)}
          disabled={isPending}
          required
          dir="ltr"
        />
        <p className="text-xs text-muted-foreground">
          העלה תמונה לאחסון ואז הדבק את הקישור כאן
        </p>
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label htmlFor="project-category">קטגוריה</Label>
        <select
          id="project-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={isPending}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <Label htmlFor="project-tags">תגיות (מופרדות בפסיקים)</Label>
        <Input
          id="project-tags"
          placeholder="למשל: עיצוב, React, לוגו"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">עד 10 תגיות</p>
      </div>

      {/* Tools */}
      <div className="space-y-2">
        <Label htmlFor="project-tools">כלים ששימשו (מופרדים בפסיקים)</Label>
        <Input
          id="project-tools"
          placeholder="למשל: Figma, Photoshop, VS Code"
          value={toolsInput}
          onChange={(e) => setToolsInput(e.target.value)}
          disabled={isPending}
          dir="ltr"
        />
        <p className="text-xs text-muted-foreground">עד 10 כלים</p>
      </div>

      {/* Completion Date */}
      {!isEditing && (
        <div className="space-y-2">
          <Label htmlFor="project-date">תאריך השלמה (אופציונלי)</Label>
          <Input
            id="project-date"
            type="date"
            value={completedAt}
            onChange={(e) => setCompletedAt(e.target.value)}
            disabled={isPending}
            dir="ltr"
          />
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isPending || !isValid}>
          {isPending ? (
            <Spinner size="sm" className="text-primary-foreground" />
          ) : isEditing ? (
            'עדכן פרויקט'
          ) : (
            'צור פרויקט'
          )}
        </Button>
      </div>
    </form>
  );
}

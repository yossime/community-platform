'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, GripVertical, BookOpen, PlayCircle, FileText, HelpCircle, ClipboardCheck } from 'lucide-react';

import { Button } from '@platform/ui/src/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Input } from '@platform/ui/src/components/input';
import { Label } from '@platform/ui/src/components/label';
import { Textarea } from '@platform/ui/src/components/textarea';
import { Spinner } from '@platform/ui/src/components/spinner';
import { Badge } from '@platform/ui/src/components/badge';
import { Separator } from '@platform/ui/src/components/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@platform/ui/src/components/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@platform/ui/src/components/select';

import { trpc } from '@/lib/trpc';
import { RichTextEditor } from './rich-text-editor';

export function CourseManage({ slug }: { slug: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: course, isLoading } = trpc.course.getBySlug.useQuery({ slug });

  const publishMutation = trpc.course.publish.useMutation({
    onSuccess: () => utils.course.getBySlug.invalidate({ slug }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!course) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          הקורס לא נמצא
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-rubik text-2xl font-bold">{course.title}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={course.isPublished ? 'default' : 'secondary'}>
              {course.isPublished ? 'מפורסם' : 'טיוטה'}
            </Badge>
            <Badge variant="outline">{course.moderationStatus}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!course.isPublished && (
            <Button
              onClick={() => publishMutation.mutate({ id: course.id })}
              disabled={publishMutation.isPending}
            >
              {publishMutation.isPending ? <Spinner className="me-2" /> : null}
              פרסם קורס
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Modules & Lessons */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-rubik text-xl font-bold">מודולים ושיעורים</h2>
          <AddModuleDialog courseId={course.id} slug={slug} />
        </div>

        {course.modules.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-muted-foreground">עדיין אין מודולים. הוסף מודול ראשון!</p>
            </CardContent>
          </Card>
        ) : (
          course.modules.map((module) => (
            <ModuleCard key={module.id} module={module} slug={slug} />
          ))
        )}
      </div>

      {publishMutation.error && (
        <p className="text-sm text-destructive">{publishMutation.error.message}</p>
      )}
    </div>
  );
}

function ModuleCard({
  module,
  slug,
}: {
  module: {
    id: string;
    title: string;
    description?: string | null;
    lessons: Array<{ id: string; title: string; type: string; displayOrder: number }>;
  };
  slug: string;
}) {
  const utils = trpc.useUtils();

  const deleteMutation = trpc.course.deleteModule.useMutation({
    onSuccess: () => utils.course.getBySlug.invalidate({ slug }),
  });

  const LESSON_TYPE_ICONS: Record<string, typeof PlayCircle> = {
    VIDEO: PlayCircle,
    TEXT: FileText,
    QUIZ: HelpCircle,
    ASSIGNMENT: ClipboardCheck,
  };

  const LESSON_TYPE_LABELS: Record<string, string> = {
    VIDEO: 'וידאו',
    TEXT: 'טקסט',
    QUIZ: 'מבחן',
    ASSIGNMENT: 'מטלה',
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-rubik text-base">{module.title}</CardTitle>
          <div className="flex items-center gap-2">
            <AddLessonDialog moduleId={module.id} slug={slug} />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={() => {
                if (window.confirm('האם למחוק את המודול ואת כל השיעורים שבו?')) {
                  deleteMutation.mutate({ moduleId: module.id });
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {module.description && (
          <p className="text-sm text-muted-foreground">{module.description}</p>
        )}
      </CardHeader>

      {module.lessons.length > 0 && (
        <CardContent className="pt-0">
          <div className="divide-y rounded-md border">
            {module.lessons.map((lesson) => {
              const Icon = LESSON_TYPE_ICONS[lesson.type] ?? FileText;
              return (
                <LessonRow key={lesson.id} lesson={lesson} Icon={Icon} slug={slug} label={LESSON_TYPE_LABELS[lesson.type] ?? lesson.type} />
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function LessonRow({
  lesson,
  Icon,
  slug,
  label,
}: {
  lesson: { id: string; title: string; type: string };
  Icon: typeof PlayCircle;
  slug: string;
  label: string;
}) {
  const utils = trpc.useUtils();
  const deleteMutation = trpc.course.deleteLesson.useMutation({
    onSuccess: () => utils.course.getBySlug.invalidate({ slug }),
  });

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" />
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-sm">{lesson.title}</span>
      <Badge variant="outline" className="text-xs">{label}</Badge>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive"
        onClick={() => deleteMutation.mutate({ lessonId: lesson.id })}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function AddModuleDialog({ courseId, slug }: { courseId: string; slug: string }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const addModule = trpc.course.addModule.useMutation({
    onSuccess: () => {
      utils.course.getBySlug.invalidate({ slug });
      setTitle('');
      setDescription('');
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="me-1 h-4 w-4" />
          הוסף מודול
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-rubik">הוסף מודול חדש</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>שם המודול *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="לדוגמה: מבוא" />
          </div>
          <div className="space-y-2">
            <Label>תיאור</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <Button
            className="w-full"
            onClick={() => addModule.mutate({ courseId, title, description: description || undefined })}
            disabled={!title.trim() || addModule.isPending}
          >
            {addModule.isPending ? <Spinner className="me-2" /> : null}
            הוסף מודול
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddLessonDialog({ moduleId, slug }: { moduleId: string; slug: string }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'VIDEO' | 'TEXT' | 'QUIZ' | 'ASSIGNMENT'>('TEXT');
  const [content, setContent] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  const addLesson = trpc.course.addLesson.useMutation({
    onSuccess: () => {
      utils.course.getBySlug.invalidate({ slug });
      setTitle('');
      setContent('');
      setVideoUrl('');
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="me-1 h-4 w-4" />
          שיעור
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-rubik">הוסף שיעור חדש</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>שם השיעור *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>סוג שיעור</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TEXT">טקסט</SelectItem>
                <SelectItem value="VIDEO">וידאו</SelectItem>
                <SelectItem value="QUIZ">מבחן</SelectItem>
                <SelectItem value="ASSIGNMENT">מטלה</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === 'VIDEO' && (
            <div className="space-y-2">
              <Label>קישור לוידאו</Label>
              <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} type="url" placeholder="https://..." />
            </div>
          )}

          <div className="space-y-2">
            <Label>תוכן</Label>
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="תוכן השיעור..."
            />
          </div>

          <Button
            className="w-full"
            onClick={() =>
              addLesson.mutate({
                moduleId,
                title,
                type,
                content: content || undefined,
                videoUrl: videoUrl || undefined,
              })
            }
            disabled={!title.trim() || addLesson.isPending}
          >
            {addLesson.isPending ? <Spinner className="me-2" /> : null}
            הוסף שיעור
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

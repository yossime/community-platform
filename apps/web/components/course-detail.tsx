'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  GraduationCap, Star, Users, Clock, BookOpen,
  PlayCircle, FileText, HelpCircle, ClipboardCheck,
  ChevronDown, ChevronUp, Lock, CheckCircle2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';

import { Button } from '@platform/ui/src/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Badge } from '@platform/ui/src/components/badge';
import { Spinner } from '@platform/ui/src/components/spinner';
import { Avatar, AvatarFallback, AvatarImage } from '@platform/ui/src/components/avatar';
import { Separator } from '@platform/ui/src/components/separator';
import { Progress } from '@platform/ui/src/components/progress';
import { Textarea } from '@platform/ui/src/components/textarea';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'מתחילים',
  INTERMEDIATE: 'בינוני',
  ADVANCED: 'מתקדם',
};

const LESSON_ICONS: Record<string, typeof PlayCircle> = {
  VIDEO: PlayCircle,
  TEXT: FileText,
  QUIZ: HelpCircle,
  ASSIGNMENT: ClipboardCheck,
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} שעות${minutes > 0 ? ` ו-${minutes} דקות` : ''}`;
  return `${minutes} דקות`;
}

function formatPrice(agorot: number): string {
  if (agorot === 0) return 'חינם';
  return `₪${(agorot / 100).toFixed(0)}`;
}

export function CourseDetail({ slug }: { slug: string }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const { data: course, isLoading } = trpc.course.getBySlug.useQuery({ slug });
  const { data: enrollment } = trpc.course.getEnrollment.useQuery(
    { courseId: course?.id ?? '' },
    { enabled: !!course?.id && !!user },
  );

  const enrollMutation = trpc.course.enroll.useMutation({
    onSuccess: () => {
      utils.course.getEnrollment.invalidate({ courseId: course?.id ?? '' });
      utils.course.getBySlug.invalidate({ slug });
    },
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
        <CardContent className="py-12 text-center">
          <GraduationCap className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 font-rubik text-lg font-semibold">הקורס לא נמצא</h3>
        </CardContent>
      </Card>
    );
  }

  const completedLessonIds = new Set(
    enrollment?.lessonProgress?.filter((p) => p.completed).map((p) => p.lessonId) ?? [],
  );

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  const isInstructor = user?.id === course.instructorId;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Course Info */}
        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{LEVEL_LABELS[course.level] ?? course.level}</Badge>
            {course.isFree && <Badge variant="secondary">חינם</Badge>}
          </div>

          <h1 className="font-rubik text-3xl font-bold">{course.title}</h1>
          <p className="text-lg text-muted-foreground">{course.shortDescription}</p>

          {/* Instructor */}
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={course.instructor.avatarUrl ?? undefined} />
              <AvatarFallback>{course.instructor.displayName?.charAt(0) ?? '?'}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">{course.instructor.displayName}</p>
              <p className="text-xs text-muted-foreground">מרצה</p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {course.averageRating > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                {course.averageRating.toFixed(1)} ({course._count.reviews} ביקורות)
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {course._count.enrollments} תלמידים
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="h-4 w-4" />
              {course.totalLessons} שיעורים
            </span>
            {course.totalDuration > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {formatDuration(course.totalDuration)}
              </span>
            )}
          </div>
        </div>

        {/* Enrollment Card */}
        <div className="w-full lg:w-80">
          <Card>
            {course.coverImageUrl && (
              <div className="relative aspect-video overflow-hidden rounded-t-lg">
                <Image src={course.coverImageUrl} alt={course.title} fill className="object-cover" />
              </div>
            )}
            <CardContent className="p-4 space-y-4">
              <div className="text-center">
                <p className="font-rubik text-3xl font-bold">{formatPrice(course.priceAgorot)}</p>
              </div>

              {enrollment ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>התקדמות</span>
                      <span>{Math.round(enrollment.progress * 100)}%</span>
                    </div>
                    <Progress value={enrollment.progress * 100} />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {enrollment.completedLessons} / {enrollment.totalLessons} שיעורים הושלמו
                  </p>
                  {enrollment.status === 'COMPLETED' && (
                    <Badge variant="default" className="w-full justify-center">
                      <CheckCircle2 className="me-1 h-4 w-4" />
                      הקורס הושלם!
                    </Badge>
                  )}
                </div>
              ) : !isInstructor ? (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => enrollMutation.mutate({ courseId: course.id })}
                  disabled={enrollMutation.isPending}
                >
                  {enrollMutation.isPending ? (
                    <Spinner className="me-2" />
                  ) : null}
                  {course.isFree ? 'הירשם בחינם' : `הירשם - ${formatPrice(course.priceAgorot)}`}
                </Button>
              ) : (
                <Link href={`/courses/${slug}/manage`}>
                  <Button variant="outline" className="w-full">
                    ניהול קורס
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Description */}
      <div>
        <h2 className="font-rubik text-xl font-bold mb-3">אודות הקורס</h2>
        <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap">
          {course.description}
        </div>
      </div>

      <Separator />

      {/* Curriculum */}
      <div>
        <h2 className="font-rubik text-xl font-bold mb-4">תוכן הקורס</h2>
        <div className="space-y-2">
          {course.modules.map((module) => {
            const isExpanded = expandedModules.has(module.id);
            const moduleLessons = module.lessons;
            const completedInModule = moduleLessons.filter((l) => completedLessonIds.has(l.id)).length;

            return (
              <Card key={module.id}>
                <button
                  onClick={() => toggleModule(module.id)}
                  className="flex w-full items-center justify-between p-4 text-start"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                    )}
                    <div>
                      <h3 className="font-medium">{module.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {moduleLessons.length} שיעורים
                        {enrollment && ` · ${completedInModule}/${moduleLessons.length} הושלמו`}
                      </p>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t">
                    {moduleLessons.map((lesson) => {
                      const Icon = LESSON_ICONS[lesson.type] ?? FileText;
                      const isCompleted = completedLessonIds.has(lesson.id);
                      const canAccess = enrollment || lesson.isFree;

                      return (
                        <div key={lesson.id}>
                          {canAccess ? (
                            <Link
                              href={`/courses/${slug}/lesson/${lesson.id}`}
                              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                              ) : (
                                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                              )}
                              <span className="flex-1 text-sm">{lesson.title}</span>
                              {lesson.isFree && !enrollment && (
                                <Badge variant="outline" className="text-xs">חינם</Badge>
                              )}
                              {lesson.videoDurationSeconds && (
                                <span className="text-xs text-muted-foreground">
                                  {formatDuration(lesson.videoDurationSeconds)}
                                </span>
                              )}
                            </Link>
                          ) : (
                            <div className="flex items-center gap-3 px-4 py-3 text-muted-foreground">
                              <Lock className="h-5 w-5 shrink-0" />
                              <span className="flex-1 text-sm">{lesson.title}</span>
                              {lesson.videoDurationSeconds && (
                                <span className="text-xs">
                                  {formatDuration(lesson.videoDurationSeconds)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Reviews */}
      {course.reviews.length > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="font-rubik text-xl font-bold mb-4">ביקורות</h2>
            <div className="space-y-4">
              {course.reviews.map((review) => (
                <Card key={review.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={review.user.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {review.user.displayName?.charAt(0) ?? '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{review.user.displayName}</p>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-3.5 w-3.5 ${
                                i < review.rating
                                  ? 'fill-yellow-400 text-yellow-400'
                                  : 'text-muted-foreground/30'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(review.createdAt), { locale: he, addSuffix: true })}
                      </span>
                    </div>
                    {review.comment && (
                      <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Write Review */}
      {enrollment && enrollment.status !== 'ACTIVE' && (
        <>
          <Separator />
          <CourseReviewForm courseId={course.id} slug={slug} />
        </>
      )}
    </div>
  );
}

function CourseReviewForm({ courseId, slug }: { courseId: string; slug: string }) {
  const utils = trpc.useUtils();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const createReview = trpc.course.createReview.useMutation({
    onSuccess: () => {
      utils.course.getBySlug.invalidate({ slug });
      setRating(0);
      setComment('');
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-rubik text-lg">כתוב ביקורת</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <button key={i} onClick={() => setRating(i + 1)}>
              <Star
                className={`h-6 w-6 transition-colors ${
                  i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30 hover:text-yellow-300'
                }`}
              />
            </button>
          ))}
        </div>

        <Textarea
          placeholder="שתף את חוויית הלמידה שלך..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
        />

        <Button
          onClick={() => createReview.mutate({ courseId, rating, comment: comment || undefined })}
          disabled={rating === 0 || createReview.isPending}
        >
          {createReview.isPending ? <Spinner className="me-2" /> : null}
          שלח ביקורת
        </Button>
      </CardContent>
    </Card>
  );
}

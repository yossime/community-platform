'use client';

import { trpc } from '@/lib/trpc';
import { LessonView } from '@/components/lesson-view';
import { Spinner } from '@platform/ui/src/components/spinner';

export default function LessonPage({
  params,
}: {
  params: { slug: string; lessonId: string };
}) {
  // Get course ID from slug
  const { data: course, isLoading } = trpc.course.getBySlug.useQuery({ slug: params.slug });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!course) {
    return <p className="text-center text-muted-foreground py-12">הקורס לא נמצא</p>;
  }

  return (
    <LessonView
      lessonId={params.lessonId}
      courseId={course.id}
      courseSlug={params.slug}
    />
  );
}

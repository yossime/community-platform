import type { Metadata } from 'next';

import { CreateCourseForm } from '@/components/create-course-form';

export const metadata: Metadata = {
  title: 'צור קורס חדש',
};

export default function NewCoursePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-rubik text-3xl font-bold">צור קורס חדש</h1>
        <p className="mt-2 text-muted-foreground">
          שתף את הידע שלך עם הקהילה
        </p>
      </div>
      <CreateCourseForm />
    </div>
  );
}

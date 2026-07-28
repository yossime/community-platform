import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { Button } from '@platform/ui/src/components/button';
import { CourseList } from '@/components/course-list';

export const metadata: Metadata = {
  title: 'קורסים',
  description: 'קורסים מקצועיים מהמומחים בקהילה',
};

export default function CoursesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-rubik text-3xl font-bold">קורסים</h1>
          <p className="mt-2 text-muted-foreground">
            קורסים מקצועיים מהמומחים בקהילה
          </p>
        </div>
        <Link href="/courses/new">
          <Button>
            <Plus className="me-2 h-4 w-4" />
            צור קורס
          </Button>
        </Link>
      </div>
      <CourseList />
    </div>
  );
}

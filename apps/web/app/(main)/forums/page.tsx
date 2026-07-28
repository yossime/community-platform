import type { Metadata } from 'next';

import { ForumCategoryList } from '@/components/forums/forum-category-list';

export const metadata: Metadata = {
  title: 'פורומים',
  description: 'דיונים מקצועיים בנושאי טכנולוגיה, עסקים וקריירה',
};

export default function ForumsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-rubik text-3xl font-bold">פורומים</h1>
        <p className="mt-2 text-muted-foreground">
          דיונים מקצועיים בנושאי טכנולוגיה, עסקים וקריירה
        </p>
      </div>
      <ForumCategoryList />
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { Button } from '@platform/ui/src/components/button';
import { ArticleList } from '@/components/article-list';

export const metadata: Metadata = {
  title: 'מאמרים',
  description: 'מאמרים מקצועיים, מדריכים וטיפים מהקהילה',
};

export default function ArticlesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-rubik text-3xl font-bold">מאמרים</h1>
          <p className="mt-2 text-muted-foreground">
            מאמרים מקצועיים, מדריכים וטיפים מהקהילה
          </p>
        </div>
        <Link href="/articles/new">
          <Button>
            <Plus className="me-2 h-4 w-4" />
            כתוב מאמר
          </Button>
        </Link>
      </div>
      <ArticleList />
    </div>
  );
}

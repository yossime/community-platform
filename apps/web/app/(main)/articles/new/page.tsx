import type { Metadata } from 'next';

import { CreateArticleForm } from '@/components/create-article-form';

export const metadata: Metadata = {
  title: 'כתוב מאמר חדש',
};

export default function NewArticlePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-rubik text-3xl font-bold">כתוב מאמר חדש</h1>
        <p className="mt-2 text-muted-foreground">
          שתף ידע ותובנות מקצועיות עם הקהילה
        </p>
      </div>
      <CreateArticleForm />
    </div>
  );
}

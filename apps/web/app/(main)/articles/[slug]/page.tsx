import type { Metadata } from 'next';

import { ArticleDetail } from '@/components/article-detail';

export const metadata: Metadata = {
  title: 'מאמר',
};

export default function ArticleDetailPage({ params }: { params: { slug: string } }) {
  return <ArticleDetail slug={params.slug} />;
}

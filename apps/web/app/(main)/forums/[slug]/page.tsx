import type { Metadata } from 'next';

import { ThreadList } from '@/components/forums/thread-list';

interface ForumPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: ForumPageProps): Promise<Metadata> {
  return {
    title: `פורום | ${params.slug}`,
  };
}

export default function ForumPage({ params }: ForumPageProps) {
  return <ThreadList forumSlug={params.slug} />;
}

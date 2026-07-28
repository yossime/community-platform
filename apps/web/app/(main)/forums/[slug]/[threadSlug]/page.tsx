import { ThreadView } from '@/components/forums/thread-view';

interface ThreadPageProps {
  params: { slug: string; threadSlug: string };
}

export default function ThreadPage({ params }: ThreadPageProps) {
  return <ThreadView forumSlug={params.slug} threadSlug={params.threadSlug} />;
}

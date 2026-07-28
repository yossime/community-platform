import type { Metadata } from 'next';

import { ClassifiedDetail } from '@/components/classifieds/classified-detail';

interface ClassifiedPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: ClassifiedPageProps): Promise<Metadata> {
  return {
    title: `מודעה | לוח מודעות`,
  };
}

export default function ClassifiedPage({ params }: ClassifiedPageProps) {
  return <ClassifiedDetail slug={params.slug} />;
}

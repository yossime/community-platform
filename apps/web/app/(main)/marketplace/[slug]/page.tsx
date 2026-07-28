import type { Metadata } from 'next';

import { ProjectDetail } from '@/components/marketplace/project-detail';

interface ProjectPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  return {
    title: `פרויקט | שוק פרילנסרים`,
  };
}

export default function ProjectPage({ params }: ProjectPageProps) {
  return <ProjectDetail slug={params.slug} />;
}

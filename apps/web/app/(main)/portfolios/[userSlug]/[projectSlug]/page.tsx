import { PortfolioProjectDetail } from '@/components/portfolios/portfolio-project-detail';

interface ProjectPageProps {
  params: { userSlug: string; projectSlug: string };
}

export default function ProjectPage({ params }: ProjectPageProps) {
  return (
    <PortfolioProjectDetail
      userSlug={params.userSlug}
      projectSlug={params.projectSlug}
    />
  );
}

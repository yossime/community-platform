import { PortfolioView } from '@/components/portfolios/portfolio-view';

interface PortfolioPageProps {
  params: { userSlug: string };
}

export default function PortfolioPage({ params }: PortfolioPageProps) {
  return <PortfolioView userSlug={params.userSlug} />;
}

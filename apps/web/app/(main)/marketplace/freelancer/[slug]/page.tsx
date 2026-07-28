import type { Metadata } from 'next';

import { FreelancerProfilePage } from '@/components/marketplace/freelancer-profile-page';

export const metadata: Metadata = {
  title: 'פרופיל פרילנסר | שוק פרילנסרים',
};

interface FreelancerPageProps {
  params: { slug: string };
}

export default function FreelancerPage({ params }: FreelancerPageProps) {
  return <FreelancerProfilePage userSlug={params.slug} />;
}

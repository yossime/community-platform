import type { Metadata } from 'next';

import { MarketplaceTabs } from '@/components/marketplace/marketplace-tabs';

export const metadata: Metadata = {
  title: 'שוק פרילנסרים',
  description: 'מצא פרילנסרים מקצועיים או פרסם פרויקט',
};

export default function MarketplacePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-rubik text-3xl font-bold">שוק פרילנסרים</h1>
        <p className="mt-2 text-muted-foreground">
          מצא פרילנסרים מקצועיים או פרסם פרויקט
        </p>
      </div>
      <MarketplaceTabs />
    </div>
  );
}

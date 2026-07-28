import type { Metadata } from 'next';

import { PortfolioExplore } from '@/components/portfolios/portfolio-explore';

export const metadata: Metadata = {
  title: 'תיקי עבודות',
  description: 'גלה עבודות מקצועיות מהקהילה — עיצוב, פיתוח, שיווק ועוד',
};

export default function PortfoliosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-rubik text-3xl font-bold">תיקי עבודות</h1>
        <p className="mt-2 text-muted-foreground">
          גלה עבודות מקצועיות מהקהילה — עיצוב, פיתוח, שיווק ועוד
        </p>
      </div>
      <PortfolioExplore />
    </div>
  );
}

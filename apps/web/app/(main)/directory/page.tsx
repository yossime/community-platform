import type { Metadata } from 'next';

import { FreelancerList } from '@/components/marketplace/freelancer-list';

export const metadata: Metadata = {
  title: 'ספר אנשי מקצוע',
  description: 'חפש ומצא אנשי מקצוע בתחומים שונים',
};

export default function DirectoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-rubik text-3xl font-bold">ספר אנשי מקצוע</h1>
        <p className="mt-2 text-muted-foreground">
          חפש ומצא אנשי מקצוע בתחומים שונים
        </p>
      </div>
      <FreelancerList />
    </div>
  );
}

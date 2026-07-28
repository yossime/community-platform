import type { Metadata } from 'next';

import { ClassifiedList } from '@/components/classifieds/classified-list';

export const metadata: Metadata = {
  title: 'לוח מודעות',
  description: 'מודעות קנייה, מכירה, דרושים ושירותים',
};

export default function ClassifiedsPage() {
  return <ClassifiedList />;
}

import type { Metadata } from 'next';

import { CreateClassifiedForm } from '@/components/classifieds/create-classified-form';

export const metadata: Metadata = {
  title: 'פרסם מודעה חדשה',
  description: 'פרסם מודעה חדשה בלוח המודעות',
};

export default function NewClassifiedPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <CreateClassifiedForm />
    </div>
  );
}

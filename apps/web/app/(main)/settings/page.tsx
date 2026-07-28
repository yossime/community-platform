import type { Metadata } from 'next';

import { SettingsPage } from '@/components/settings/settings-page';

export const metadata: Metadata = {
  title: 'הגדרות',
};

export default function Settings() {
  return <SettingsPage />;
}

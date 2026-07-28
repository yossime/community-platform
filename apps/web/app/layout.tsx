import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';

import '@/styles/globals.css';

import { Toaster } from '@platform/ui/src/components/toaster';

import { Providers } from '@/lib/providers';
import { PostHogProvider } from '@/components/analytics/posthog-provider';
import { PageView } from '@/components/analytics/page-view';

export const metadata: Metadata = {
  title: {
    default: 'קהילת אנשי מקצוע חרדים',
    template: '%s | קהילת אנשי מקצוע חרדים',
  },
  description: 'הפלטפורמה המובילה לאנשי מקצוע בציבור החרדי - פורומים, שוק פרילנסרים, קורסים ועוד',
  keywords: ['חרדי', 'פרילנסר', 'קהילה מקצועית', 'פורומים', 'עבודה'],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className="font-heebo min-h-screen bg-background antialiased">
        <PostHogProvider>
          <Providers>
            <Suspense fallback={null}>
              <PageView />
            </Suspense>
            {children}
            <Toaster />
          </Providers>
        </PostHogProvider>
      </body>
    </html>
  );
}

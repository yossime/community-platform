'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import posthog from 'posthog-js';

/**
 * PageView — tracks page views on Next.js App Router route changes.
 *
 * Because the App Router uses client-side navigation (no full page reloads),
 * we disable PostHog's built-in pageview capture and manually fire $pageview
 * events whenever the pathname or search params change.
 *
 * This component should be placed inside the root layout, wrapped in Suspense
 * (useSearchParams requires a Suspense boundary).
 */
export function PageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname;
      const search = searchParams.toString();
      if (search) {
        url = url + '?' + search;
      }
      posthog.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams]);

  return null;
}

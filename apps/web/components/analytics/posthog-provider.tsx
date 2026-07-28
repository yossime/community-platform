'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';

/**
 * PostHog analytics provider — wraps the app with PostHog context.
 *
 * Self-hosted configuration for Netfree compatibility:
 * - No external CDN dependencies
 * - No autocapture (could trigger filtered content warnings)
 * - All data stays on the self-hosted PostHog instance
 * - Manual pageview tracking for Next.js App Router SPA navigation
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

    if (key && host) {
      posthog.init(key, {
        api_host: host,

        // Manual pageview tracking — Next.js App Router uses client-side
        // navigation, so automatic page views would miss route changes
        capture_pageview: false,

        // Track when users leave the page (useful for engagement metrics)
        capture_pageleave: true,

        // Use localStorage for persistence (sessionStorage is too short-lived)
        persistence: 'localStorage',

        // Disable autocapture for Netfree compatibility:
        // Autocapture injects event listeners on all DOM elements and may
        // attempt to load external resources or capture sensitive content
        autocapture: false,

        // Critical for Netfree: prevent PostHog from loading any external
        // scripts, fonts, or resources. Everything must be self-hosted.
        disable_external_dependency_loading: true,

        // Disable session recording by default (can be enabled per-environment)
        // Session recording may capture content that violates modesty rules
        disable_session_recording: true,

        // Respect Do Not Track browser setting
        respect_dnt: true,

        // Batch events to reduce network requests
        request_batching: true,
      });
    }
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

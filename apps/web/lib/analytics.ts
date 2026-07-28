import posthog from 'posthog-js';

// ---------------------------------------------------------------------------
// Analytics helper functions for the Platform
// ---------------------------------------------------------------------------
// All functions are SSR-safe (check for window/posthog before calling).
// All analytics are self-hosted via PostHog — no external CDN or third-party
// scripts are loaded, ensuring Netfree compatibility.
// ---------------------------------------------------------------------------

/**
 * Check if PostHog is initialized and available.
 * Guards against SSR (no window) and missing PostHog configuration.
 */
function isPostHogReady(): boolean {
  if (typeof window === 'undefined') return false;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return false;
  // PostHog sets __loaded after successful init
  return !!(posthog as unknown as Record<string, unknown>).__loaded;
}

// ---------------------------------------------------------------------------
// Generic event tracking
// ---------------------------------------------------------------------------

/**
 * Track a custom analytics event.
 *
 * @param event - Event name (e.g., 'button_clicked', 'form_submitted')
 * @param properties - Optional properties to attach to the event
 */
export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!isPostHogReady()) return;
  posthog.capture(event, properties);
}

// ---------------------------------------------------------------------------
// User identification
// ---------------------------------------------------------------------------

/**
 * Identify an authenticated user in PostHog.
 * Call this after successful login or when the session is restored.
 *
 * @param userId - The user's unique ID (from Supabase Auth)
 * @param traits - Optional user properties (display name, role, membership tier, etc.)
 */
export function identifyUser(
  userId: string,
  traits?: Record<string, unknown>,
): void {
  if (!isPostHogReady()) return;
  posthog.identify(userId, traits);
}

/**
 * Reset the PostHog user identity.
 * Call this on logout to ensure the next user gets a fresh anonymous ID.
 */
export function resetUser(): void {
  if (!isPostHogReady()) return;
  posthog.reset();
}

// ---------------------------------------------------------------------------
// Domain-specific tracking helpers
// ---------------------------------------------------------------------------

/**
 * Track a search query and its result count.
 * Useful for understanding what users search for and whether they find results.
 *
 * @param query - The search query string
 * @param resultCount - Number of results returned
 * @param searchType - Type of search ('keyword' | 'semantic' | 'autocomplete')
 */
export function trackSearch(
  query: string,
  resultCount: number,
  searchType?: 'keyword' | 'semantic' | 'autocomplete',
): void {
  if (!isPostHogReady()) return;
  posthog.capture('search_performed', {
    query,
    result_count: resultCount,
    search_type: searchType ?? 'keyword',
    has_results: resultCount > 0,
  });
}

/**
 * Track content creation events.
 * Covers all UGC types: threads, posts, articles, courses, projects, classifieds, etc.
 *
 * @param type - Content type (e.g., 'thread', 'post', 'article', 'course', 'project', 'classified', 'portfolio')
 * @param entityId - The created entity's ID
 * @param metadata - Optional additional metadata (e.g., forum name, category)
 */
export function trackContentCreation(
  type: string,
  entityId: string,
  metadata?: Record<string, unknown>,
): void {
  if (!isPostHogReady()) return;
  posthog.capture('content_created', {
    content_type: type,
    entity_id: entityId,
    ...metadata,
  });
}

/**
 * Track payment events.
 * Covers membership subscriptions, marketplace escrow, and classified purchases.
 * Amount is in agorot (integer) to match the platform's currency convention.
 *
 * @param amountAgorot - Payment amount in agorot (1/100 ILS)
 * @param type - Payment type (e.g., 'subscription', 'escrow_fund', 'escrow_release', 'classified_purchase')
 * @param metadata - Optional additional metadata (e.g., tier, project ID)
 */
export function trackPayment(
  amountAgorot: number,
  type: string,
  metadata?: Record<string, unknown>,
): void {
  if (!isPostHogReady()) return;
  posthog.capture('payment_completed', {
    amount_agorot: amountAgorot,
    amount_ils: amountAgorot / 100,
    payment_type: type,
    currency: 'ILS',
    ...metadata,
  });
}

// ---------------------------------------------------------------------------
// Engagement tracking helpers
// ---------------------------------------------------------------------------

/**
 * Track when a user views content (thread, article, course, portfolio, profile).
 *
 * @param type - Content type being viewed
 * @param entityId - The entity's ID
 * @param metadata - Optional additional metadata
 */
export function trackContentView(
  type: string,
  entityId: string,
  metadata?: Record<string, unknown>,
): void {
  if (!isPostHogReady()) return;
  posthog.capture('content_viewed', {
    content_type: type,
    entity_id: entityId,
    ...metadata,
  });
}

/**
 * Track feature usage for understanding adoption of platform features.
 *
 * @param feature - Feature name (e.g., 'ai_matching', 'course_enrollment', 'direct_message')
 * @param metadata - Optional additional metadata
 */
export function trackFeatureUsage(
  feature: string,
  metadata?: Record<string, unknown>,
): void {
  if (!isPostHogReady()) return;
  posthog.capture('feature_used', {
    feature,
    ...metadata,
  });
}

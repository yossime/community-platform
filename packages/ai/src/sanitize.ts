/**
 * Text sanitizer for UGC content.
 * Stage 1 of the moderation pipeline: sanitize → AI check → human review
 */

// HTML entities to remove (basic XSS prevention)
const HTML_TAG_REGEX = /<[^>]*>/g;
const SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_REGEX = /on\w+\s*=\s*["'][^"']*["']/gi;

// Excessive whitespace / newlines
const EXCESSIVE_NEWLINES_REGEX = /\n{4,}/g;
const EXCESSIVE_SPACES_REGEX = / {3,}/g;

// URLs that could be phishing or spam
const SUSPICIOUS_URL_REGEX = /(?:bit\.ly|tinyurl\.com|goo\.gl|t\.co|is\.gd|buff\.ly)\/\S+/gi;

export interface SanitizeResult {
  text: string;
  warnings: string[];
}

export function sanitizeText(input: string): SanitizeResult {
  const warnings: string[] = [];
  let text = input;

  // Remove script tags
  if (SCRIPT_REGEX.test(text)) {
    warnings.push('script_tags_removed');
    text = text.replace(SCRIPT_REGEX, '');
  }

  // Remove HTML tags
  if (HTML_TAG_REGEX.test(text)) {
    warnings.push('html_tags_removed');
    text = text.replace(HTML_TAG_REGEX, '');
  }

  // Remove event handlers
  if (EVENT_HANDLER_REGEX.test(text)) {
    warnings.push('event_handlers_removed');
    text = text.replace(EVENT_HANDLER_REGEX, '');
  }

  // Flag suspicious URLs (don't remove, just warn)
  if (SUSPICIOUS_URL_REGEX.test(text)) {
    warnings.push('suspicious_urls_detected');
  }

  // Normalize excessive whitespace
  text = text.replace(EXCESSIVE_NEWLINES_REGEX, '\n\n\n');
  text = text.replace(EXCESSIVE_SPACES_REGEX, '  ');

  // Trim
  text = text.trim();

  return { text, warnings };
}

/**
 * Check if text is within allowed length limits
 */
export function validateLength(text: string, min: number, max: number): string | null {
  if (text.length < min) return `התוכן קצר מדי (מינימום ${min} תווים)`;
  if (text.length > max) return `התוכן ארוך מדי (מקסימום ${max} תווים)`;
  return null;
}

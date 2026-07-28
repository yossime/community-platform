import { z } from 'zod';

// ─── Entity Types for Media Processing ──────────────

export const mediaEntityTypeSchema = z.enum([
  'avatar',
  'portfolio_media',
  'listing_image',
  'article_cover',
  'course_cover',
  'project_file',
]);

export type MediaEntityType = z.infer<typeof mediaEntityTypeSchema>;

// ─── SQS Message Payload ────────────────────────────

export const mediaProcessingPayloadSchema = z.object({
  entityType: mediaEntityTypeSchema,
  entityId: z.string().min(1),
  bucket: z.string().min(1),
  path: z.string().min(1),
  userId: z.string().min(1),
});

export type MediaProcessingPayload = z.infer<typeof mediaProcessingPayloadSchema>;

// ─── Image Variant ──────────────────────────────────

export interface ImageVariant {
  width: number;
  height: number;
  url: string;
  size: number;
}

// ─── Processing Result ──────────────────────────────

export interface ProcessingResult {
  entityType: MediaEntityType;
  entityId: string;
  variants: ImageVariant[];
  blurhash: string;
  originalWidth: number;
  originalHeight: number;
  moderationStatus: 'APPROVED' | 'FLAGGED';
  moderationReason: string | null;
}

// ─── Modesty Check Response from GPT-4o Vision ─────

export const modestyCheckResponseSchema = z.object({
  approved: z.boolean(),
  reason: z.string().nullable(),
});

export type ModestyCheckResponse = z.infer<typeof modestyCheckResponseSchema>;

// ─── Variant Size Configuration ─────────────────────

export const VARIANT_WIDTHS = [200, 600, 1200, 2400] as const;

export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

// ─── Entity → Storage Path Mapping ──────────────────

/**
 * Maps entity types to their destination folder in the public storage bucket.
 */
export const ENTITY_STORAGE_PATHS: Record<MediaEntityType, string> = {
  avatar: 'avatars',
  portfolio_media: 'portfolios',
  listing_image: 'classifieds',
  article_cover: 'articles',
  course_cover: 'courses',
  project_file: 'projects',
} as const;

// ─── Entity → DB Table Mapping ──────────────────────

/**
 * Maps entity types to their database table name for raw SQL updates.
 * Only models where we need to update image-related columns.
 */
export const ENTITY_TABLE_MAP: Record<MediaEntityType, string> = {
  avatar: 'users',
  portfolio_media: 'portfolio_media',
  listing_image: 'classified_listings',
  article_cover: 'articles',
  course_cover: 'courses',
  project_file: 'projects',
} as const;

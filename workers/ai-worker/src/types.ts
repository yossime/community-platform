import { z } from 'zod';

// ─── Entity Types ────────────────────────────────────

export const entityTypeSchema = z.enum([
  'thread',
  'post',
  'article',
  'listing',
  'portfolio_project',
  'portfolio_comment',
  'article_comment',
  'course',
  'message',
  'project',
]);

export type EntityType = z.infer<typeof entityTypeSchema>;

// ─── SQS Message Payloads ────────────────────────────

const moderateTextPayloadSchema = z.object({
  type: z.literal('moderate_text'),
  entityType: entityTypeSchema,
  entityId: z.string().min(1),
  content: z.string().min(1),
});

const moderateImagePayloadSchema = z.object({
  type: z.literal('moderate_image'),
  entityType: entityTypeSchema,
  entityId: z.string().min(1),
  imageUrl: z.string().url(),
});

const generateEmbeddingPayloadSchema = z.object({
  type: z.literal('generate_embedding'),
  entityType: entityTypeSchema,
  entityId: z.string().min(1),
  content: z.string().min(1),
});

const summarizeThreadPayloadSchema = z.object({
  type: z.literal('summarize_thread'),
  entityType: z.literal('thread'),
  entityId: z.string().min(1),
  content: z.string().min(1),
});

export const sqsMessagePayloadSchema = z.discriminatedUnion('type', [
  moderateTextPayloadSchema,
  moderateImagePayloadSchema,
  generateEmbeddingPayloadSchema,
  summarizeThreadPayloadSchema,
]);

export type SQSMessagePayload = z.infer<typeof sqsMessagePayloadSchema>;
export type ModerateTextPayload = z.infer<typeof moderateTextPayloadSchema>;
export type ModerateImagePayload = z.infer<typeof moderateImagePayloadSchema>;
export type GenerateEmbeddingPayload = z.infer<typeof generateEmbeddingPayloadSchema>;
export type SummarizeThreadPayload = z.infer<typeof summarizeThreadPayloadSchema>;

// ─── Moderation Result ───────────────────────────────

export interface ModerationResult {
  isApproved: boolean;
  confidence: number;
  flaggedCategories: string[];
  reason?: string;
}

// ─── Image Moderation Vision Response ────────────────

export const imageModerationResponseSchema = z.object({
  approved: z.boolean(),
  reason: z.string().nullable(),
});

export type ImageModerationResponse = z.infer<typeof imageModerationResponseSchema>;

// ─── Entity Type → Prisma Model Mapping ──────────────

/**
 * Maps SQS entityType values to Prisma model names for dynamic updates.
 * Only models with a moderationStatus field are included.
 */
export const MODERABLE_ENTITY_MAP: Record<string, string> = {
  thread: 'thread',
  post: 'post',
  article: 'article',
  listing: 'classifiedListing',
  portfolio_comment: 'portfolioComment',
  article_comment: 'articleComment',
  course: 'course',
  project: 'project',
} as const;

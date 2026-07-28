import { z } from 'zod';

// ─── Search Index Names ─────────────────────────────

export const searchIndexNameSchema = z.enum([
  'threads',
  'posts',
  'articles',
  'courses',
  'freelancers',
  'classifieds',
  'portfolios',
]);

export type SearchIndexName = z.infer<typeof searchIndexNameSchema>;

// ─── SQS Message Payload ────────────────────────────

export const searchActionSchema = z.enum(['upsert', 'delete']);

export type SearchAction = z.infer<typeof searchActionSchema>;

export const sqsSearchMessageSchema = z.object({
  action: searchActionSchema,
  index: searchIndexNameSchema,
  entityId: z.string().min(1),
});

export type SQSSearchMessage = z.infer<typeof sqsSearchMessageSchema>;

// ─── Search Document Shapes ─────────────────────────

/**
 * Each document shape corresponds to one Meilisearch index.
 * The `id` field is required by Meilisearch as the primary key.
 */

export interface ThreadDocument {
  id: string;
  title: string;
  content: string;
  forumName: string;
  forumSlug: string;
  authorName: string;
  authorSlug: string;
  tags: string[];
  postCount: number;
  viewCount: number;
  status: string;
  moderationStatus: string;
  isPinned: boolean;
  slug: string;
  createdAt: number; // Unix timestamp in seconds for Meilisearch sorting
}

export interface PostDocument {
  id: string;
  content: string;
  authorName: string;
  authorSlug: string;
  threadId: string;
  threadTitle: string;
  threadSlug: string;
  forumName: string;
  forumSlug: string;
  moderationStatus: string;
  createdAt: number;
}

export interface ArticleDocument {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  authorName: string;
  authorSlug: string;
  category: string;
  categorySlug: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  isPublished: boolean;
  isEditorsPick: boolean;
  moderationStatus: string;
  slug: string;
  publishedAt: number | null;
  createdAt: number;
}

export interface CourseDocument {
  id: string;
  title: string;
  description: string;
  shortDescription: string;
  instructorName: string;
  instructorSlug: string;
  level: string;
  tags: string[];
  priceAgorot: number;
  isFree: boolean;
  isPublished: boolean;
  averageRating: number;
  enrollmentCount: number;
  moderationStatus: string;
  slug: string;
  createdAt: number;
}

export interface FreelancerDocument {
  id: string;
  displayName: string;
  userSlug: string;
  headline: string;
  description: string;
  skills: string[];
  hourlyRateAgorot: number | null;
  averageRating: number;
  completedProjects: number;
  availability: string;
  location: string | null;
}

export interface ClassifiedDocument {
  id: string;
  title: string;
  description: string;
  category: string;
  categorySlug: string;
  priceAgorot: number | null;
  priceLabel: string | null;
  location: string;
  type: string;
  status: string;
  moderationStatus: string;
  isFeatured: boolean;
  authorName: string;
  slug: string;
  createdAt: number;
}

export interface PortfolioDocument {
  id: string;
  title: string;
  description: string;
  authorName: string;
  authorSlug: string;
  tags: string[];
  tools: string[];
  category: string | null;
  likeCount: number;
  viewCount: number;
  slug: string;
  createdAt: number;
}

export type SearchDocument =
  | ThreadDocument
  | PostDocument
  | ArticleDocument
  | CourseDocument
  | FreelancerDocument
  | ClassifiedDocument
  | PortfolioDocument;

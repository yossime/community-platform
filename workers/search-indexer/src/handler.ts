import type { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda';
import { PrismaClient } from '@prisma/client';
import { MeiliSearch } from 'meilisearch';

import {
  sqsSearchMessageSchema,
  type SQSSearchMessage,
  type SearchIndexName,
  type ThreadDocument,
  type PostDocument,
  type ArticleDocument,
  type CourseDocument,
  type FreelancerDocument,
  type ClassifiedDocument,
  type PortfolioDocument,
} from './types';

// ─── Singleton Clients ───────────────────────────────

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

const meilisearch = new MeiliSearch({
  host: process.env.MEILISEARCH_URL ?? process.env.MEILISEARCH_HOST ?? '',
  apiKey: process.env.MEILISEARCH_API_KEY,
});

// ─── Batching Helpers ────────────────────────────────

interface BatchedUpsert {
  index: SearchIndexName;
  entityId: string;
  messageId: string;
}

interface BatchedDelete {
  index: SearchIndexName;
  entityId: string;
  messageId: string;
}

// ─── Lambda Handler ──────────────────────────────────

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  // Group messages by action and index for batch processing
  const upserts: BatchedUpsert[] = [];
  const deletes: BatchedDelete[] = [];
  const parseErrors: string[] = [];

  for (const record of event.Records) {
    try {
      const rawBody: unknown = JSON.parse(record.body);
      const payload = sqsSearchMessageSchema.parse(rawBody);

      if (payload.action === 'upsert') {
        upserts.push({
          index: payload.index,
          entityId: payload.entityId,
          messageId: record.messageId,
        });
      } else {
        deletes.push({
          index: payload.index,
          entityId: payload.entityId,
          messageId: record.messageId,
        });
      }
    } catch (error) {
      console.error(`[search-indexer] Failed to parse message ${record.messageId}:`, error);
      parseErrors.push(record.messageId);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  // Process upserts batched by index
  const upsertsByIndex = groupByIndex(upserts);
  for (const [indexName, items] of Object.entries(upsertsByIndex)) {
    const failedIds = await processUpsertBatch(
      indexName as SearchIndexName,
      items,
    );
    for (const failedId of failedIds) {
      batchItemFailures.push({ itemIdentifier: failedId });
    }
  }

  // Process deletes batched by index
  const deletesByIndex = groupByIndex(deletes);
  for (const [indexName, items] of Object.entries(deletesByIndex)) {
    const failedIds = await processDeleteBatch(
      indexName as SearchIndexName,
      items,
    );
    for (const failedId of failedIds) {
      batchItemFailures.push({ itemIdentifier: failedId });
    }
  }

  // Log overall batch results
  const total = event.Records.length;
  const failed = batchItemFailures.length;
  const succeeded = total - failed;
  console.log(
    `[search-indexer] Batch complete: ${succeeded} succeeded, ${failed} failed out of ${total} records`,
  );

  return { batchItemFailures };
}

// ─── Batch Processing ────────────────────────────────

function groupByIndex<T extends { index: SearchIndexName }>(
  items: T[],
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const item of items) {
    const existing = grouped[item.index];
    if (existing) {
      existing.push(item);
    } else {
      grouped[item.index] = [item];
    }
  }
  return grouped;
}

async function processUpsertBatch(
  indexName: SearchIndexName,
  items: BatchedUpsert[],
): Promise<string[]> {
  const failedMessageIds: string[] = [];
  const documents: Record<string, unknown>[] = [];
  const documentMessageMap = new Map<string, string>();

  // Fetch all entities and transform to search documents
  for (const item of items) {
    try {
      const document = await fetchAndTransform(indexName, item.entityId);
      if (document) {
        documents.push(document as unknown as Record<string, unknown>);
        documentMessageMap.set(item.entityId, item.messageId);
      } else {
        console.warn(
          `[search-indexer] Entity not found for ${indexName}:${item.entityId}, skipping upsert`,
        );
        // Entity not found is not a failure — it may have been deleted between
        // the SQS message being sent and now
      }
    } catch (error) {
      console.error(
        `[search-indexer] Failed to fetch entity for ${indexName}:${item.entityId}:`,
        error,
      );
      failedMessageIds.push(item.messageId);
    }
  }

  // Batch upsert to Meilisearch
  if (documents.length > 0) {
    try {
      const index = meilisearch.index(indexName);
      await index.addDocuments(documents);
      console.log(
        `[search-indexer] Upserted ${documents.length} document(s) to index "${indexName}"`,
      );
    } catch (error) {
      console.error(
        `[search-indexer] Meilisearch batch upsert failed for index "${indexName}":`,
        error,
      );
      // Mark all documents in this batch as failed
      for (const item of items) {
        if (!failedMessageIds.includes(item.messageId)) {
          failedMessageIds.push(item.messageId);
        }
      }
    }
  }

  return failedMessageIds;
}

async function processDeleteBatch(
  indexName: SearchIndexName,
  items: BatchedDelete[],
): Promise<string[]> {
  const failedMessageIds: string[] = [];
  const entityIds = items.map((item) => item.entityId);

  try {
    const index = meilisearch.index(indexName);
    await index.deleteDocuments(entityIds);
    console.log(
      `[search-indexer] Deleted ${entityIds.length} document(s) from index "${indexName}"`,
    );
  } catch (error) {
    console.error(
      `[search-indexer] Meilisearch batch delete failed for index "${indexName}":`,
      error,
    );
    for (const item of items) {
      failedMessageIds.push(item.messageId);
    }
  }

  return failedMessageIds;
}

// ─── Entity Fetch & Transform ────────────────────────

/**
 * Fetches an entity from the database by ID and transforms it into a
 * Meilisearch-compatible search document. Returns null if the entity is
 * not found (e.g., it was deleted between queue publish and processing).
 */
async function fetchAndTransform(
  indexName: SearchIndexName,
  entityId: string,
): Promise<
  | ThreadDocument
  | PostDocument
  | ArticleDocument
  | CourseDocument
  | FreelancerDocument
  | ClassifiedDocument
  | PortfolioDocument
  | null
> {
  switch (indexName) {
    case 'threads':
      return fetchThread(entityId);
    case 'posts':
      return fetchPost(entityId);
    case 'articles':
      return fetchArticle(entityId);
    case 'courses':
      return fetchCourse(entityId);
    case 'freelancers':
      return fetchFreelancer(entityId);
    case 'classifieds':
      return fetchClassified(entityId);
    case 'portfolios':
      return fetchPortfolio(entityId);
  }
}

// ─── Thread ──────────────────────────────────────────

async function fetchThread(entityId: string): Promise<ThreadDocument | null> {
  const thread = await prisma.thread.findUnique({
    where: { id: entityId },
    include: {
      forum: { select: { name: true, slug: true } },
      author: { select: { displayName: true, slug: true } },
    },
  });

  if (!thread) return null;

  // Fetch tags via the polymorphic TagRelation table
  const tagRelations = await prisma.tagRelation.findMany({
    where: { entityType: 'thread', entityId },
    include: { tag: { select: { name: true } } },
  });

  return {
    id: thread.id,
    title: thread.title,
    content: stripHtml(thread.content),
    forumName: thread.forum.name,
    forumSlug: thread.forum.slug,
    authorName: thread.author.displayName,
    authorSlug: thread.author.slug,
    tags: tagRelations.map((tr) => tr.tag.name),
    postCount: thread.postCount,
    viewCount: thread.viewCount,
    status: thread.status,
    moderationStatus: thread.moderationStatus,
    isPinned: thread.isPinned,
    slug: thread.slug,
    createdAt: toUnixTimestamp(thread.createdAt),
  };
}

// ─── Post ────────────────────────────────────────────

async function fetchPost(entityId: string): Promise<PostDocument | null> {
  const post = await prisma.post.findUnique({
    where: { id: entityId },
    include: {
      author: { select: { displayName: true, slug: true } },
      thread: {
        select: {
          id: true,
          title: true,
          slug: true,
          forum: { select: { name: true, slug: true } },
        },
      },
    },
  });

  if (!post) return null;

  return {
    id: post.id,
    content: stripHtml(post.content),
    authorName: post.author.displayName,
    authorSlug: post.author.slug,
    threadId: post.thread.id,
    threadTitle: post.thread.title,
    threadSlug: post.thread.slug,
    forumName: post.thread.forum.name,
    forumSlug: post.thread.forum.slug,
    moderationStatus: post.moderationStatus,
    createdAt: toUnixTimestamp(post.createdAt),
  };
}

// ─── Article ─────────────────────────────────────────

async function fetchArticle(entityId: string): Promise<ArticleDocument | null> {
  const article = await prisma.article.findUnique({
    where: { id: entityId },
    include: {
      author: { select: { displayName: true, slug: true } },
      category: { select: { name: true, slug: true } },
    },
  });

  if (!article) return null;

  // Fetch tags via polymorphic TagRelation
  const tagRelations = await prisma.tagRelation.findMany({
    where: { entityType: 'article', entityId },
    include: { tag: { select: { name: true } } },
  });

  return {
    id: article.id,
    title: article.title,
    content: stripHtml(article.content),
    excerpt: article.excerpt,
    authorName: article.author.displayName,
    authorSlug: article.author.slug,
    category: article.category.name,
    categorySlug: article.category.slug,
    tags: tagRelations.map((tr) => tr.tag.name),
    viewCount: article.viewCount,
    likeCount: article.likeCount,
    isPublished: article.isPublished,
    isEditorsPick: article.isEditorsPick,
    moderationStatus: article.moderationStatus,
    slug: article.slug,
    publishedAt: article.publishedAt ? toUnixTimestamp(article.publishedAt) : null,
    createdAt: toUnixTimestamp(article.createdAt),
  };
}

// ─── Course ──────────────────────────────────────────

async function fetchCourse(entityId: string): Promise<CourseDocument | null> {
  const course = await prisma.course.findUnique({
    where: { id: entityId },
    include: {
      instructor: { select: { displayName: true, slug: true } },
    },
  });

  if (!course) return null;

  // Fetch tags via polymorphic TagRelation
  const tagRelations = await prisma.tagRelation.findMany({
    where: { entityType: 'course', entityId },
    include: { tag: { select: { name: true } } },
  });

  return {
    id: course.id,
    title: course.title,
    description: stripHtml(course.description),
    shortDescription: course.shortDescription,
    instructorName: course.instructor.displayName,
    instructorSlug: course.instructor.slug,
    level: course.level,
    tags: tagRelations.map((tr) => tr.tag.name),
    priceAgorot: course.priceAgorot,
    isFree: course.isFree,
    isPublished: course.isPublished,
    averageRating: course.averageRating,
    enrollmentCount: course.enrollmentCount,
    moderationStatus: course.moderationStatus,
    slug: course.slug,
    createdAt: toUnixTimestamp(course.createdAt),
  };
}

// ─── Freelancer ──────────────────────────────────────

async function fetchFreelancer(entityId: string): Promise<FreelancerDocument | null> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { id: entityId },
    include: {
      user: { select: { displayName: true, slug: true, location: true } },
    },
  });

  if (!profile) return null;

  return {
    id: profile.id,
    displayName: profile.user.displayName,
    userSlug: profile.user.slug,
    headline: profile.headline ?? '',
    description: profile.description ? stripHtml(profile.description) : '',
    skills: profile.skills,
    hourlyRateAgorot: profile.hourlyRateAgorot,
    averageRating: profile.averageRating,
    completedProjects: profile.completedProjects,
    availability: profile.availability,
    location: profile.user.location,
  };
}

// ─── Classified ──────────────────────────────────────

async function fetchClassified(entityId: string): Promise<ClassifiedDocument | null> {
  const listing = await prisma.classifiedListing.findUnique({
    where: { id: entityId },
    include: {
      category: { select: { name: true, slug: true } },
      author: { select: { displayName: true } },
    },
  });

  if (!listing) return null;

  return {
    id: listing.id,
    title: listing.title,
    description: stripHtml(listing.description),
    category: listing.category.name,
    categorySlug: listing.category.slug,
    priceAgorot: listing.priceAgorot,
    priceLabel: listing.priceLabel,
    location: listing.location,
    type: listing.type,
    status: listing.status,
    moderationStatus: listing.moderationStatus,
    isFeatured: listing.isFeatured,
    authorName: listing.author.displayName,
    slug: listing.slug,
    createdAt: toUnixTimestamp(listing.createdAt),
  };
}

// ─── Portfolio ───────────────────────────────────────

async function fetchPortfolio(entityId: string): Promise<PortfolioDocument | null> {
  const project = await prisma.portfolioProject.findUnique({
    where: { id: entityId },
    include: {
      portfolio: {
        include: {
          user: { select: { displayName: true, slug: true } },
        },
      },
    },
  });

  if (!project) return null;

  return {
    id: project.id,
    title: project.title,
    description: stripHtml(project.description),
    authorName: project.portfolio.user.displayName,
    authorSlug: project.portfolio.user.slug,
    tags: project.tags,
    tools: project.tools,
    category: project.category,
    likeCount: project.likeCount,
    viewCount: project.viewCount,
    slug: project.slug,
    createdAt: toUnixTimestamp(project.createdAt),
  };
}

// ─── Utilities ───────────────────────────────────────

/**
 * Strips HTML tags from content for clean text indexing.
 * Handles common HTML entities and collapses whitespace.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts a Date to a Unix timestamp in seconds.
 * Meilisearch uses numeric timestamps for sorting and filtering.
 */
function toUnixTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

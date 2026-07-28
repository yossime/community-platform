import { meilisearch } from './client';

export const INDEXES = {
  threads: 'threads',
  projects: 'projects',
  classifieds: 'classifieds',
  articles: 'articles',
  courses: 'courses',
  users: 'users',
  portfolios: 'portfolios',
} as const;

export type IndexName = (typeof INDEXES)[keyof typeof INDEXES];

export async function setupIndexes() {
  // Threads
  const threads = meilisearch.index(INDEXES.threads);
  await threads.updateSettings({
    searchableAttributes: ['title', 'content', 'authorName'],
    filterableAttributes: ['forumId', 'status', 'moderationStatus', 'createdAt'],
    sortableAttributes: ['createdAt', 'viewCount', 'postCount'],
  });

  // Projects
  const projects = meilisearch.index(INDEXES.projects);
  await projects.updateSettings({
    searchableAttributes: ['title', 'description', 'skills'],
    filterableAttributes: ['status', 'moderationStatus', 'skills', 'isUrgent'],
    sortableAttributes: ['createdAt', 'budgetMaxAgorot'],
  });

  // Classifieds
  const classifieds = meilisearch.index(INDEXES.classifieds);
  await classifieds.updateSettings({
    searchableAttributes: ['title', 'description', 'location'],
    filterableAttributes: ['categoryId', 'type', 'status', 'location'],
    sortableAttributes: ['createdAt', 'priceAgorot'],
  });

  // Articles
  const articles = meilisearch.index(INDEXES.articles);
  await articles.updateSettings({
    searchableAttributes: ['title', 'content', 'excerpt', 'authorName'],
    filterableAttributes: ['categoryId', 'isPublished', 'isEditorsPick'],
    sortableAttributes: ['publishedAt', 'viewCount', 'likeCount'],
  });

  // Courses
  const courses = meilisearch.index(INDEXES.courses);
  await courses.updateSettings({
    searchableAttributes: ['title', 'description', 'shortDescription'],
    filterableAttributes: ['level', 'isFree', 'isPublished'],
    sortableAttributes: ['createdAt', 'averageRating', 'enrollmentCount'],
  });

  // Users
  const users = meilisearch.index(INDEXES.users);
  await users.updateSettings({
    searchableAttributes: ['displayName', 'username', 'bio', 'location'],
    filterableAttributes: ['role', 'status'],
    sortableAttributes: ['createdAt'],
  });

  // Portfolios
  const portfolios = meilisearch.index(INDEXES.portfolios);
  await portfolios.updateSettings({
    searchableAttributes: ['title', 'description', 'tags', 'tools'],
    filterableAttributes: ['category'],
    sortableAttributes: ['createdAt', 'likeCount', 'viewCount'],
  });
}

import type { MetadataRoute } from 'next';

import { prisma } from '@platform/db';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://platform.co.il';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/forums`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/marketplace`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/classifieds`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/portfolios`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/courses`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/articles`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/directory`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/search`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.5,
    },
  ];

  // Fetch all dynamic content in parallel for maximum performance
  const [
    forumCategories,
    forums,
    threads,
    articles,
    courses,
    freelancers,
    classifieds,
    portfolioProjects,
  ] = await Promise.all([
    // Forum categories
    prisma.forumCategory.findMany({
      select: { slug: true },
    }),
    // Forums (public only)
    prisma.forum.findMany({
      select: { slug: true },
      where: { isPrivate: false },
    }),
    // Threads (approved, non-archived)
    prisma.thread.findMany({
      select: {
        slug: true,
        updatedAt: true,
        forum: { select: { slug: true } },
      },
      where: {
        moderationStatus: 'APPROVED',
        status: { in: ['OPEN', 'CLOSED'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10000,
    }),
    // Articles (published + approved)
    prisma.article.findMany({
      select: { slug: true, updatedAt: true, publishedAt: true },
      where: {
        isPublished: true,
        moderationStatus: 'APPROVED',
      },
      orderBy: { publishedAt: 'desc' },
      take: 10000,
    }),
    // Courses (published + approved)
    prisma.course.findMany({
      select: { slug: true, updatedAt: true },
      where: {
        isPublished: true,
        moderationStatus: 'APPROVED',
      },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    }),
    // Freelancer profiles (available + active user)
    prisma.freelancerProfile.findMany({
      select: {
        user: { select: { slug: true } },
      },
      where: {
        availability: { not: 'UNAVAILABLE' },
        user: { status: 'ACTIVE' },
      },
      take: 10000,
    }),
    // Classifieds (active, approved, not expired)
    prisma.classifiedListing.findMany({
      select: { slug: true, updatedAt: true },
      where: {
        status: 'ACTIVE',
        moderationStatus: 'APPROVED',
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10000,
    }),
    // Portfolio projects (public portfolios with active users)
    prisma.portfolioProject.findMany({
      select: {
        slug: true,
        updatedAt: true,
        portfolio: {
          select: {
            user: { select: { slug: true } },
            visibility: true,
          },
        },
      },
      where: {
        portfolio: {
          visibility: 'PUBLIC',
          user: { status: 'ACTIVE' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10000,
    }),
  ]);

  // Forum category routes
  const forumCategoryPages: MetadataRoute.Sitemap = forumCategories.map((category) => ({
    url: `${BASE_URL}/forums/${category.slug}`,
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }));

  // Forum routes
  const forumPages: MetadataRoute.Sitemap = forums.map((forum) => ({
    url: `${BASE_URL}/forums/${forum.slug}`,
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }));

  // Thread routes
  const threadPages: MetadataRoute.Sitemap = threads.map((thread) => ({
    url: `${BASE_URL}/forums/${thread.forum.slug}/${thread.slug}`,
    lastModified: thread.updatedAt,
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }));

  // Article routes
  const articlePages: MetadataRoute.Sitemap = articles.map((article) => ({
    url: `${BASE_URL}/articles/${article.slug}`,
    lastModified: article.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // Course routes
  const coursePages: MetadataRoute.Sitemap = courses.map((course) => ({
    url: `${BASE_URL}/courses/${course.slug}`,
    lastModified: course.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // Freelancer profile routes
  const freelancerPages: MetadataRoute.Sitemap = freelancers.map((freelancer) => ({
    url: `${BASE_URL}/marketplace/freelancer/${freelancer.user.slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  // Classified listing routes
  const classifiedPages: MetadataRoute.Sitemap = classifieds.map((listing) => ({
    url: `${BASE_URL}/classifieds/${listing.slug}`,
    lastModified: listing.updatedAt,
    changeFrequency: 'daily' as const,
    priority: 0.5,
  }));

  // Portfolio project routes
  const portfolioPages: MetadataRoute.Sitemap = portfolioProjects.map((project) => ({
    url: `${BASE_URL}/portfolios/${project.portfolio.user.slug}/${project.slug}`,
    lastModified: project.updatedAt,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));

  return [
    ...staticPages,
    ...forumCategoryPages,
    ...forumPages,
    ...threadPages,
    ...articlePages,
    ...coursePages,
    ...freelancerPages,
    ...classifiedPages,
    ...portfolioPages,
  ];
}

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { prisma } from '@platform/db';
import { redis } from '@platform/cache/src/client';

/**
 * Cache warming cron job.
 * Schedule: Every 30 minutes (via Vercel Cron)
 *
 * Pre-warms frequently accessed cache keys:
 * - Homepage data (platform stats, recent activity)
 * - Trending threads (most active in last 24h)
 * - Popular forums (by post count)
 * - Featured classified listings
 */

const CACHE_TTL = {
  homepageStats: 60 * 35, // 35 minutes (outlives the 30-min cron cycle)
  trendingThreads: 60 * 35,
  popularForums: 60 * 35,
  featuredListings: 60 * 35,
} as const;

export async function GET(request: NextRequest) {
  // Verify Vercel cron authentication
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/cache-warm] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const warmed: Record<string, boolean> = {};

  try {
    // 1. Homepage platform stats
    try {
      const [totalUsers, totalThreads, totalProjects, totalCourses] =
        await Promise.all([
          prisma.user.count({ where: { status: 'ACTIVE' } }),
          prisma.thread.count({ where: { moderationStatus: 'APPROVED' } }),
          prisma.project.count(),
          prisma.course.count({ where: { isPublished: true } }),
        ]);

      await redis.set(
        'cache:homepage:stats',
        {
          totalUsers,
          totalThreads,
          totalProjects,
          totalCourses,
          updatedAt: new Date().toISOString(),
        },
        { ex: CACHE_TTL.homepageStats },
      );
      warmed.homepageStats = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.warn('[cron/cache-warm] Homepage stats failed:', msg);
      warmed.homepageStats = false;
    }

    // 2. Trending threads (most active in last 24h by post count)
    try {
      const twentyFourHoursAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      );

      const trendingThreads = await prisma.thread.findMany({
        where: {
          moderationStatus: 'APPROVED',
          lastPostAt: { gte: twentyFourHoursAgo },
        },
        orderBy: [{ postCount: 'desc' }, { viewCount: 'desc' }],
        take: 20,
        select: {
          id: true,
          title: true,
          slug: true,
          viewCount: true,
          postCount: true,
          lastPostAt: true,
          createdAt: true,
          forum: {
            select: {
              name: true,
              slug: true,
            },
          },
          author: {
            select: {
              displayName: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
      });

      await redis.set('cache:trending:threads', trendingThreads, {
        ex: CACHE_TTL.trendingThreads,
      });
      warmed.trendingThreads = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.warn('[cron/cache-warm] Trending threads failed:', msg);
      warmed.trendingThreads = false;
    }

    // 3. Popular forums (by total post count, top 15)
    try {
      const popularForums = await prisma.forum.findMany({
        orderBy: { postCount: 'desc' },
        take: 15,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          iconUrl: true,
          threadCount: true,
          postCount: true,
          lastPostAt: true,
          category: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      });

      await redis.set('cache:popular:forums', popularForums, {
        ex: CACHE_TTL.popularForums,
      });
      warmed.popularForums = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.warn('[cron/cache-warm] Popular forums failed:', msg);
      warmed.popularForums = false;
    }

    // 4. Featured classified listings (active, featured, not expired)
    try {
      const now = new Date();

      const featuredListings = await prisma.classifiedListing.findMany({
        where: {
          status: 'ACTIVE',
          moderationStatus: 'APPROVED',
          isFeatured: true,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          id: true,
          title: true,
          slug: true,
          type: true,
          priceAgorot: true,
          priceLabel: true,
          images: true,
          location: true,
          viewCount: true,
          createdAt: true,
          category: {
            select: {
              name: true,
              slug: true,
            },
          },
          author: {
            select: {
              displayName: true,
              username: true,
            },
          },
        },
      });

      await redis.set('cache:featured:listings', featuredListings, {
        ex: CACHE_TTL.featuredListings,
      });
      warmed.featuredListings = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.warn('[cron/cache-warm] Featured listings failed:', msg);
      warmed.featuredListings = false;
    }

    const successCount = Object.values(warmed).filter(Boolean).length;
    const totalCount = Object.keys(warmed).length;
    const durationMs = Date.now() - startedAt;

    return NextResponse.json({
      success: successCount === totalCount,
      warmed,
      summary: `${successCount}/${totalCount} caches warmed`,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cron/cache-warm] Failed:', message);

    return NextResponse.json(
      {
        error: 'Cache warm cron failed',
        message,
        partialWarmed: warmed,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

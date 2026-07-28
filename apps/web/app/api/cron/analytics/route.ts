import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { prisma } from '@platform/db';
import { redis } from '@platform/cache/src/client';

/**
 * Daily analytics rollup cron job.
 * Schedule: Daily at 02:00 UTC (via Vercel Cron)
 *
 * Performs:
 * - Flushes Redis buffered counters (viewCount, postCount, etc.) to the database
 * - Calculates daily active users
 * - Stores a daily analytics snapshot in Redis
 */
export async function GET(request: NextRequest) {
  // Verify Vercel cron authentication
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/analytics] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const stats: Record<string, number> = {};

  try {
    // 1. Flush Redis buffered counters to the database
    let countersFlushed = 0;

    // Scan for all buffered counter keys
    let cursor = 0;
    const counterKeys: string[] = [];

    do {
      const result = await redis.scan(cursor, {
        match: 'counter:*',
        count: 200,
      });
      const [nextCursor, keys] = result as unknown as [number, string[]];
      cursor = nextCursor;
      counterKeys.push(...keys);
    } while (cursor !== 0);

    // Process each counter key and flush to DB
    for (const key of counterKeys) {
      const counters = await redis.hgetall<Record<string, number>>(key);
      if (!counters || Object.keys(counters).length === 0) continue;

      // Parse the key format: counter:{entityType}:{entityId}
      const parts = key.split(':');
      if (parts.length < 3) continue;

      const entityType = parts[1];
      const entityId = parts.slice(2).join(':');

      try {
        // Flush counters based on entity type
        switch (entityType) {
          case 'thread': {
            const updateData: Record<string, { increment: number }> = {};
            if (counters.viewCount) {
              updateData.viewCount = { increment: counters.viewCount };
            }
            if (counters.postCount) {
              updateData.postCount = { increment: counters.postCount };
            }
            if (Object.keys(updateData).length > 0) {
              await prisma.thread.update({
                where: { id: entityId },
                data: updateData,
              });
            }
            break;
          }
          case 'forum': {
            const updateData: Record<string, { increment: number }> = {};
            if (counters.threadCount) {
              updateData.threadCount = { increment: counters.threadCount };
            }
            if (counters.postCount) {
              updateData.postCount = { increment: counters.postCount };
            }
            if (Object.keys(updateData).length > 0) {
              await prisma.forum.update({
                where: { id: entityId },
                data: updateData,
              });
            }
            break;
          }
          case 'article': {
            if (counters.viewCount) {
              await prisma.article.update({
                where: { id: entityId },
                data: { viewCount: { increment: counters.viewCount } },
              });
            }
            break;
          }
          case 'classified': {
            if (counters.viewCount) {
              await prisma.classifiedListing.update({
                where: { id: entityId },
                data: { viewCount: { increment: counters.viewCount } },
              });
            }
            break;
          }
          case 'ad': {
            const updateData: Record<string, { increment: number }> = {};
            if (counters.impressionCount) {
              updateData.impressionCount = {
                increment: counters.impressionCount,
              };
            }
            if (counters.clickCount) {
              updateData.clickCount = { increment: counters.clickCount };
            }
            if (Object.keys(updateData).length > 0) {
              await prisma.ad.update({
                where: { id: entityId },
                data: updateData,
              });
            }
            break;
          }
          default:
            // Unknown entity type — skip but log
            console.warn(
              `[cron/analytics] Unknown counter entity type: ${entityType}`,
            );
            continue;
        }

        // Delete the flushed counter key from Redis
        await redis.del(key);
        countersFlushed++;
      } catch (flushError) {
        // Log individual flush failures but continue processing others
        const flushMessage =
          flushError instanceof Error
            ? flushError.message
            : 'Unknown flush error';
        console.warn(
          `[cron/analytics] Failed to flush ${key}: ${flushMessage}`,
        );
      }
    }
    stats.countersFlushed = countersFlushed;
    stats.counterKeysFound = counterKeys.length;

    // 2. Calculate daily active users (users who had activity in the last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      activePosters,
      activeThreadCreators,
      totalUsers,
      totalThreads,
      totalPosts,
      totalArticles,
      totalCourses,
      totalListings,
    ] = await Promise.all([
      // Users who posted in the last 24h
      prisma.post.findMany({
        where: { createdAt: { gte: twentyFourHoursAgo } },
        select: { authorId: true },
        distinct: ['authorId'],
      }),
      // Users who created threads in the last 24h
      prisma.thread.findMany({
        where: { createdAt: { gte: twentyFourHoursAgo } },
        select: { authorId: true },
        distinct: ['authorId'],
      }),
      // Total platform counts
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.thread.count({ where: { moderationStatus: 'APPROVED' } }),
      prisma.post.count({ where: { moderationStatus: 'APPROVED' } }),
      prisma.article.count({
        where: { isPublished: true, moderationStatus: 'APPROVED' },
      }),
      prisma.course.count({ where: { isPublished: true } }),
      prisma.classifiedListing.count({
        where: { status: 'ACTIVE', moderationStatus: 'APPROVED' },
      }),
    ]);

    // Deduplicate active users across posts and threads
    const activeUserIds = new Set<string>();
    for (const poster of activePosters) {
      activeUserIds.add(poster.authorId);
    }
    for (const creator of activeThreadCreators) {
      activeUserIds.add(creator.authorId);
    }

    stats.dailyActiveUsers = activeUserIds.size;
    stats.totalUsers = totalUsers;
    stats.totalThreads = totalThreads;
    stats.totalPosts = totalPosts;
    stats.totalArticles = totalArticles;
    stats.totalCourses = totalCourses;
    stats.totalListings = totalListings;

    // 3. Store daily analytics snapshot in Redis (kept for 90 days)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const snapshotKey = `analytics:daily:${today}`;
    const snapshotTtl = 90 * 24 * 60 * 60; // 90 days in seconds

    await redis.set(
      snapshotKey,
      {
        date: today,
        dailyActiveUsers: stats.dailyActiveUsers,
        totalUsers: stats.totalUsers,
        totalThreads: stats.totalThreads,
        totalPosts: stats.totalPosts,
        totalArticles: stats.totalArticles,
        totalCourses: stats.totalCourses,
        totalListings: stats.totalListings,
        countersFlushed: stats.countersFlushed,
        generatedAt: new Date().toISOString(),
      },
      { ex: snapshotTtl },
    );

    const durationMs = Date.now() - startedAt;

    return NextResponse.json({
      success: true,
      stats,
      snapshotKey,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cron/analytics] Failed:', message);

    return NextResponse.json(
      {
        error: 'Analytics cron failed',
        message,
        partialStats: stats,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

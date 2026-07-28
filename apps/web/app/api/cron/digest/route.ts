import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { prisma } from '@platform/db';

/**
 * Weekly digest email cron job.
 * Schedule: Sunday 08:00 UTC (via Vercel Cron)
 *
 * Queries recent platform activity and dispatches digest notifications
 * to users who have opted in to weekly digest emails.
 */
export async function GET(request: NextRequest) {
  // Verify Vercel cron authentication
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/digest] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Gather platform activity stats for the past week in parallel
    const [
      newThreadsCount,
      newProjectsCount,
      newArticlesCount,
      newCoursesCount,
      newListingsCount,
      digestUsers,
    ] = await Promise.all([
      prisma.thread.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
          moderationStatus: 'APPROVED',
        },
      }),
      prisma.project.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      prisma.article.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
          isPublished: true,
          moderationStatus: 'APPROVED',
        },
      }),
      prisma.course.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
          isPublished: true,
        },
      }),
      prisma.classifiedListing.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
          status: 'ACTIVE',
          moderationStatus: 'APPROVED',
        },
      }),
      // Find users who have opted in to weekly digest emails
      prisma.userSettings.findMany({
        where: {
          digestFrequency: 'WEEKLY',
          emailNotifications: true,
          user: {
            status: 'ACTIVE',
          },
        },
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      }),
    ]);

    const activitySummary = {
      newThreads: newThreadsCount,
      newProjects: newProjectsCount,
      newArticles: newArticlesCount,
      newCourses: newCoursesCount,
      newListings: newListingsCount,
      periodStart: sevenDaysAgo.toISOString(),
      periodEnd: new Date().toISOString(),
    };

    // Create digest notifications for each subscribed user
    if (digestUsers.length > 0) {
      await prisma.notification.createMany({
        data: digestUsers.map((settings) => ({
          userId: settings.userId,
          type: 'WEEKLY_DIGEST' as const,
          title: 'סיכום שבועי',
          body: `השבוע בפלטפורמה: ${newThreadsCount} דיונים חדשים, ${newProjectsCount} פרויקטים, ${newArticlesCount} מאמרים`,
          data: activitySummary,
          channels: ['EMAIL' as const],
          actionUrl: '/',
        })),
      });
    }

    const durationMs = Date.now() - startedAt;

    return NextResponse.json({
      success: true,
      activity: activitySummary,
      recipientCount: digestUsers.length,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cron/digest] Failed:', message);

    return NextResponse.json(
      {
        error: 'Digest cron failed',
        message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

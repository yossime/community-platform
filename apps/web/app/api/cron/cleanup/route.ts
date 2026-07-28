import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { prisma } from '@platform/db';

/**
 * Cleanup cron job.
 * Schedule: Every 6 hours (via Vercel Cron)
 *
 * Performs housekeeping tasks:
 * - Expires classified listings past their expiresAt date
 * - Removes stale unverified user verification tokens (>48h)
 * - Cleans old read notifications (>90 days)
 * - Removes orphaned temp uploads from Supabase Storage (>24h)
 */
export async function GET(request: NextRequest) {
  // Verify Vercel cron authentication
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/cleanup] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const results: Record<string, number> = {};

  try {
    const now = new Date();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // 1. Expire classified listings past their expiresAt date
    const expiredListings = await prisma.classifiedListing.updateMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: now },
      },
      data: {
        status: 'EXPIRED',
      },
    });
    results.expiredListings = expiredListings.count;

    // 2. Clean stale unverified user verification tokens (>48h old)
    const staleVerifications = await prisma.userVerification.deleteMany({
      where: {
        verified: false,
        expiresAt: { lt: fortyEightHoursAgo },
      },
    });
    results.staleVerifications = staleVerifications.count;

    // 3. Delete old read notifications (>90 days old and already read)
    const oldNotifications = await prisma.notification.deleteMany({
      where: {
        readAt: { not: null },
        createdAt: { lt: ninetyDaysAgo },
      },
    });
    results.oldNotifications = oldNotifications.count;

    // 4. Clean temp uploads from Supabase Storage (>24h)
    // This uses the Supabase Storage API to list and delete files in the temp bucket.
    // Only runs if SUPABASE_SERVICE_ROLE_KEY is configured.
    let tempFilesDeleted = 0;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceRoleKey) {
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      try {
        // List files in the temp bucket
        const listResponse = await fetch(
          `${supabaseUrl}/storage/v1/object/list/temp`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
              apikey: serviceRoleKey,
            },
            body: JSON.stringify({
              prefix: '',
              limit: 1000,
              offset: 0,
            }),
          },
        );

        if (listResponse.ok) {
          const files = (await listResponse.json()) as Array<{
            name: string;
            created_at: string;
          }>;

          const staleFiles = files.filter(
            (file) => new Date(file.created_at) < twentyFourHoursAgo,
          );

          if (staleFiles.length > 0) {
            const deleteResponse = await fetch(
              `${supabaseUrl}/storage/v1/object/temp`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${serviceRoleKey}`,
                  'Content-Type': 'application/json',
                  apikey: serviceRoleKey,
                },
                body: JSON.stringify({
                  prefixes: staleFiles.map((f) => f.name),
                }),
              },
            );

            if (deleteResponse.ok) {
              tempFilesDeleted = staleFiles.length;
            }
          }
        }
      } catch (storageError) {
        // Log but don't fail the entire cron if storage cleanup fails
        const storageMessage =
          storageError instanceof Error
            ? storageError.message
            : 'Unknown storage error';
        console.warn('[cron/cleanup] Storage cleanup warning:', storageMessage);
      }
    }
    results.tempFilesDeleted = tempFilesDeleted;

    const durationMs = Date.now() - startedAt;

    return NextResponse.json({
      success: true,
      cleaned: results,
      totalCleaned:
        results.expiredListings +
        results.staleVerifications +
        results.oldNotifications +
        results.tempFilesDeleted,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cron/cleanup] Failed:', message);

    return NextResponse.json(
      {
        error: 'Cleanup cron failed',
        message,
        partialResults: results,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';

import { prisma } from '@platform/db';
import { redis } from '@platform/cache/src/client';

/**
 * Health check endpoint.
 * GET /api/health
 *
 * Verifies connectivity to core infrastructure:
 * - PostgreSQL (via Prisma)
 * - Redis (via Upstash)
 *
 * Returns 200 if all checks pass, 503 if any check fails.
 */

interface HealthCheck {
  status: 'ok' | 'error';
  latencyMs: number;
  message?: string;
}

export async function GET() {
  const checks: Record<string, HealthCheck> = {};
  let allHealthy = true;

  try {
    // 1. Database health check — simple query to verify connectivity
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = {
        status: 'ok',
        latencyMs: Date.now() - dbStart,
      };
    } catch (error) {
      allHealthy = false;
      const message = error instanceof Error ? error.message : 'Connection failed';
      checks.database = {
        status: 'error',
        latencyMs: Date.now() - dbStart,
        message,
      };
      console.error('[health] Database check failed:', message);
    }

    // 2. Redis health check — simple ping to verify connectivity
    const redisStart = Date.now();
    try {
      const pong = await redis.ping();
      if (pong === 'PONG') {
        checks.cache = {
          status: 'ok',
          latencyMs: Date.now() - redisStart,
        };
      } else {
        throw new Error(`Unexpected ping response: ${pong}`);
      }
    } catch (error) {
      allHealthy = false;
      const message = error instanceof Error ? error.message : 'Connection failed';
      checks.cache = {
        status: 'error',
        latencyMs: Date.now() - redisStart,
        message,
      };
      console.error('[health] Redis check failed:', message);
    }

    const statusCode = allHealthy ? 200 : 503;

    return NextResponse.json(
      {
        status: allHealthy ? 'healthy' : 'degraded',
        checks,
        timestamp: new Date().toISOString(),
      },
      {
        status: statusCode,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      },
    );
  } catch (error) {
    console.error('[health] Unexpected error:', error);
    return NextResponse.json(
      {
        status: 'error',
        checks,
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      },
    );
  }
}

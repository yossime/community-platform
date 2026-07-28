import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { z } from 'zod';

// Zod schema for the revalidation request body
const revalidateSchema = z.object({
  // Revalidate by path (e.g., "/forums/general/my-thread")
  path: z.string().startsWith('/').optional(),
  // Revalidate by cache tag (e.g., "thread-abc123")
  tag: z.string().min(1).optional(),
  // Path revalidation type: 'page' for just the page, 'layout' for page + all layouts
  type: z.enum(['page', 'layout']).default('page'),
}).refine(
  (data) => data.path !== undefined || data.tag !== undefined,
  { message: 'Either "path" or "tag" must be provided' }
);

type RevalidatePayload = z.infer<typeof revalidateSchema>;

export async function POST(request: NextRequest) {
  try {
    // Validate the revalidation secret
    const secret = request.headers.get('x-revalidation-secret')
      ?? request.nextUrl.searchParams.get('secret');

    const expectedSecret = process.env.REVALIDATION_SECRET;

    if (!expectedSecret) {
      console.error('[revalidate] REVALIDATION_SECRET is not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (secret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Invalid revalidation secret' },
        { status: 401 }
      );
    }

    // Parse and validate the request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const parsed = revalidateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { path, tag, type } = parsed.data as RevalidatePayload;

    const revalidated: { path?: string; tag?: string } = {};

    if (path) {
      revalidatePath(path, type);
      revalidated.path = path;
    }

    if (tag) {
      revalidateTag(tag);
      revalidated.tag = tag;
    }

    return NextResponse.json({
      revalidated: true,
      ...revalidated,
      timestamp: Date.now(),
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[revalidate] Failed:', message);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

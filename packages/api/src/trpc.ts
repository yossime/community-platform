import { type SupabaseClient } from '@supabase/supabase-js';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

import { type PrismaClient } from '@platform/db';
import { apiRateLimit, contentCreationRateLimit, searchRateLimit } from '@platform/cache/src/rate-limit';

export interface CreateContextOptions {
  prisma: PrismaClient;
  supabase: SupabaseClient;
  userId: string | null;
  userRole: string | null;
  clientIp: string | null;
}

export const createTRPCContext = (opts: CreateContextOptions) => {
  return {
    prisma: opts.prisma,
    supabase: opts.supabase,
    userId: opts.userId ?? undefined,
    userRole: opts.userRole ?? undefined,
    clientIp: opts.clientIp ?? undefined,
  };
};

export type Context = ReturnType<typeof createTRPCContext>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

// ─── Rate Limiting Middleware ───────────────────────────

const rateLimitMiddleware = t.middleware(async ({ ctx, next }) => {
  const identifier = ctx.userId ?? ctx.clientIp ?? 'anonymous';
  const { success } = await apiRateLimit.limit(identifier);
  if (!success) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'יותר מדי בקשות. נסה שוב מאוחר יותר' });
  }
  return next({ ctx });
});

const contentRateLimitMiddleware = t.middleware(async ({ ctx, next }) => {
  const identifier = ctx.userId ?? ctx.clientIp ?? 'anonymous';
  const { success } = await contentCreationRateLimit.limit(identifier);
  if (!success) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'יותר מדי תכנים. נסה שוב בעוד דקה' });
  }
  return next({ ctx });
});

const searchRateLimitMiddleware = t.middleware(async ({ ctx, next }) => {
  const identifier = ctx.userId ?? ctx.clientIp ?? 'anonymous';
  const { success } = await searchRateLimit.limit(identifier);
  if (!success) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'יותר מדי חיפושים. נסה שוב בעוד דקה' });
  }
  return next({ ctx });
});

// ─── Procedures ─────────────────────────────────────────

export const publicProcedure = t.procedure.use(rateLimitMiddleware);

export const protectedProcedure = t.procedure
  .use(rateLimitMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'יש להתחבר כדי לבצע פעולה זו' });
    }
    return next({
      ctx: {
        ...ctx,
        userId: ctx.userId,
      },
    });
  });

export const contentMutationProcedure = protectedProcedure.use(contentRateLimitMiddleware);

export const searchProcedure = t.procedure.use(searchRateLimitMiddleware);

export const moderatorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.userRole || !['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(ctx.userRole)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאות מנהל' });
  }
  return next({ ctx });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.userRole || !['ADMIN', 'SUPER_ADMIN'].includes(ctx.userRole)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאות מנהל ראשי' });
  }
  return next({ ctx });
});

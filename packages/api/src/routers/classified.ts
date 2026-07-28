import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  contentMutationProcedure,
} from '../trpc';

const classifiedTypeEnum = z.enum([
  'SELLING',
  'BUYING',
  'JOB_OFFER',
  'JOB_SEEKING',
  'REAL_ESTATE',
  'SERVICE',
  'EVENT',
]);

export const classifiedRouter = createTRPCRouter({
  // ─── Categories ───────────────────────────────────────

  listCategories: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.classifiedCategory.findMany({
      where: { parentId: null },
      orderBy: { displayOrder: 'asc' },
      include: {
        children: { orderBy: { displayOrder: 'asc' } },
        _count: { select: { listings: true } },
      },
    });
  }),

  // ─── Listings ─────────────────────────────────────────

  list: publicProcedure
    .input(
      z.object({
        categorySlug: z.string().optional(),
        type: classifiedTypeEnum.optional(),
        location: z.string().optional(),
        priceMin: z.number().int().nonnegative().optional(),
        priceMax: z.number().int().positive().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        sortBy: z.enum(['newest', 'price_low', 'price_high', 'popular']).default('newest'),
      }),
    )
    .query(async ({ ctx, input }) => {
      let categoryId: string | undefined;
      if (input.categorySlug) {
        const cat = await ctx.prisma.classifiedCategory.findUnique({
          where: { slug: input.categorySlug },
        });
        categoryId = cat?.id;
      }

      const orderBy = {
        newest: { createdAt: 'desc' as const },
        price_low: { priceAgorot: 'asc' as const },
        price_high: { priceAgorot: 'desc' as const },
        popular: { viewCount: 'desc' as const },
      }[input.sortBy];

      const listings = await ctx.prisma.classifiedListing.findMany({
        where: {
          moderationStatus: 'APPROVED',
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
          ...(input.type ? { type: input.type } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(input.location ? { location: { contains: input.location, mode: 'insensitive' as const } } : {}),
          ...(input.priceMin ? { priceAgorot: { gte: input.priceMin } } : {}),
          ...(input.priceMax ? { priceAgorot: { lte: input.priceMax } } : {}),
        },
        orderBy: [{ isFeatured: 'desc' }, orderBy],
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          author: { select: { id: true, displayName: true, slug: true } },
        },
      });

      let nextCursor: string | undefined;
      if (listings.length > input.limit) {
        const nextItem = listings.pop();
        nextCursor = nextItem?.id;
      }

      return { listings, nextCursor };
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const listing = await ctx.prisma.classifiedListing.findUnique({
        where: { slug: input.slug },
        include: {
          category: true,
          author: {
            select: {
              id: true,
              displayName: true,
              slug: true,
              avatarUrl: true,
              createdAt: true,
            },
          },
        },
      });

      if (!listing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'המודעה לא נמצאה' });
      }

      // Increment view count
      await ctx.prisma.classifiedListing.update({
        where: { id: listing.id },
        data: { viewCount: { increment: 1 } },
      });

      return listing;
    }),

  create: contentMutationProcedure
    .input(
      z.object({
        categoryId: z.string(),
        title: z.string().min(5).max(200),
        description: z.string().min(20).max(5000),
        type: classifiedTypeEnum,
        priceAgorot: z.number().int().nonnegative().optional(),
        priceLabel: z.string().max(50).optional(),
        location: z.string().min(2).max(100),
        contactPhone: z.string().optional(),
        contactEmail: z.string().email().optional(),
        images: z.array(z.string().url()).max(10).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slug =
        input.title
          .toLowerCase()
          .replace(/[^a-z0-9\u0590-\u05FF]+/g, '-')
          .replace(/(^-|-$)/g, '')
          .slice(0, 100) +
        '-' +
        Date.now().toString(36);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      return ctx.prisma.classifiedListing.create({
        data: {
          categoryId: input.categoryId,
          title: input.title,
          description: input.description,
          type: input.type,
          priceAgorot: input.priceAgorot,
          priceLabel: input.priceLabel,
          location: input.location,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
          images: input.images,
          slug,
          authorId: ctx.userId!,
          status: 'ACTIVE',
          expiresAt,
          moderationStatus: 'PENDING',
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(5).max(200).optional(),
        description: z.string().min(20).max(5000).optional(),
        priceAgorot: z.number().int().nonnegative().optional(),
        priceLabel: z.string().max(50).optional(),
        location: z.string().min(2).max(100).optional(),
        contactPhone: z.string().optional(),
        contactEmail: z.string().email().optional(),
        images: z.array(z.string().url()).max(10).optional(),
        status: z.enum(['ACTIVE', 'SOLD', 'REMOVED']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const listing = await ctx.prisma.classifiedListing.findUnique({ where: { id: input.id } });
      if (!listing) throw new TRPCError({ code: 'NOT_FOUND', message: 'המודעה לא נמצאה' });
      if (listing.authorId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה לערוך מודעה זו' });
      }

      const { id, ...data } = input;
      return ctx.prisma.classifiedListing.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const listing = await ctx.prisma.classifiedListing.findUnique({ where: { id: input.id } });
      if (!listing) throw new TRPCError({ code: 'NOT_FOUND', message: 'המודעה לא נמצאה' });
      if (listing.authorId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה למחוק מודעה זו' });
      }

      return ctx.prisma.classifiedListing.update({
        where: { id: input.id },
        data: { status: 'REMOVED' },
      });
    }),

  myListings: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        status: z.enum(['ACTIVE', 'SOLD', 'EXPIRED', 'REMOVED']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const listings = await ctx.prisma.classifiedListing.findMany({
        where: {
          authorId: ctx.userId!,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
      });

      let nextCursor: string | undefined;
      if (listings.length > input.limit) {
        const nextItem = listings.pop();
        nextCursor = nextItem?.id;
      }

      return { listings, nextCursor };
    }),

  // ─── Favorites ────────────────────────────────────────

  toggleFavorite: protectedProcedure
    .input(z.object({ listingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.classifiedFavorite.findUnique({
        where: { listingId_userId: { listingId: input.listingId, userId: ctx.userId! } },
      });

      if (existing) {
        await ctx.prisma.$transaction([
          ctx.prisma.classifiedFavorite.delete({ where: { id: existing.id } }),
          ctx.prisma.classifiedListing.update({
            where: { id: input.listingId },
            data: { favoriteCount: { decrement: 1 } },
          }),
        ]);
        return { favorited: false };
      }

      await ctx.prisma.$transaction([
        ctx.prisma.classifiedFavorite.create({
          data: { listingId: input.listingId, userId: ctx.userId! },
        }),
        ctx.prisma.classifiedListing.update({
          where: { id: input.listingId },
          data: { favoriteCount: { increment: 1 } },
        }),
      ]);
      return { favorited: true };
    }),

  myFavorites: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const favorites = await ctx.prisma.classifiedFavorite.findMany({
        where: { userId: ctx.userId! },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          listing: {
            include: {
              category: { select: { id: true, name: true, slug: true } },
              author: { select: { id: true, displayName: true, slug: true } },
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (favorites.length > input.limit) {
        const nextItem = favorites.pop();
        nextCursor = nextItem?.id;
      }

      return {
        listings: favorites.map((f) => ({ ...f.listing, favoritedAt: f.createdAt })),
        nextCursor,
      };
    }),

  isFavorited: protectedProcedure
    .input(z.object({ listingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const fav = await ctx.prisma.classifiedFavorite.findUnique({
        where: { listingId_userId: { listingId: input.listingId, userId: ctx.userId! } },
      });
      return { favorited: !!fav };
    }),
});

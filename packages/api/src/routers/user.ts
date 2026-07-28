import { z } from 'zod';

import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const userRouter = createTRPCRouter({
  getProfile: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { slug: input.slug },
        include: {
          skills: { include: { tag: true } },
          reputation: true,
          membership: true,
        },
      });
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'המשתמש לא נמצא' });
      }
      return user;
    }),

  getMe: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.userId! },
      include: {
        settings: true,
        membership: true,
        reputation: true,
      },
    });
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'המשתמש לא נמצא' });
    }
    return user;
  }),

  completeRegistration: publicProcedure
    .input(
      z.object({
        supabaseAuthId: z.string(),
        email: z.string().email(),
        displayName: z.string().min(2).max(50),
        username: z.string().min(3).max(30).regex(/^[a-z0-9-]+$/, 'שם משתמש יכול להכיל אותיות באנגלית, מספרים ומקפים'),
        gender: z.enum(['MALE', 'FEMALE']),
        phone: z.string().optional(),
        location: z.string().max(100).optional(),
        bio: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user already exists
      const existingUser = await ctx.prisma.user.findUnique({
        where: { supabaseAuthId: input.supabaseAuthId },
      });
      if (existingUser) {
        throw new TRPCError({ code: 'CONFLICT', message: 'משתמש כבר קיים במערכת' });
      }

      // Check username uniqueness
      const existingUsername = await ctx.prisma.user.findUnique({
        where: { username: input.username },
      });
      if (existingUsername) {
        throw new TRPCError({ code: 'CONFLICT', message: 'שם המשתמש כבר תפוס' });
      }

      // Create slug from username
      const slug = input.username;

      // Create user with settings, membership, and reputation in a transaction
      const user = await ctx.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            supabaseAuthId: input.supabaseAuthId,
            email: input.email,
            displayName: input.displayName,
            username: input.username,
            slug,
            gender: input.gender,
            phone: input.phone,
            location: input.location,
            bio: input.bio,
          },
        });

        await tx.userSettings.create({
          data: {
            userId: newUser.id,
          },
        });

        await tx.membership.create({
          data: {
            userId: newUser.id,
            tier: 'FREE',
            status: 'ACTIVE',
          },
        });

        await tx.reputation.create({
          data: {
            userId: newUser.id,
          },
        });

        return newUser;
      });

      return user;
    }),

  checkUsernameAvailability: publicProcedure
    .input(z.object({ username: z.string().min(3).max(30) }))
    .query(async ({ ctx, input }) => {
      const existing = await ctx.prisma.user.findUnique({
        where: { username: input.username },
        select: { id: true },
      });
      return { available: !existing };
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(2).max(50).optional(),
        bio: z.string().max(500).optional(),
        location: z.string().max(100).optional(),
        website: z.string().url().optional().or(z.literal('')),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.user.update({
        where: { id: ctx.userId! },
        data: input,
      });
    }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        theme: z.enum(['light', 'dark']).optional(),
        emailNotifications: z.boolean().optional(),
        whatsappNotifications: z.boolean().optional(),
        pushNotifications: z.boolean().optional(),
        profileVisibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
        showOnlineStatus: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.userSettings.update({
        where: { userId: ctx.userId! },
        data: input,
      });
    }),
});

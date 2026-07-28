import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  contentMutationProcedure,
} from '../trpc';

export const marketplaceRouter = createTRPCRouter({
  // ─── Projects ─────────────────────────────────────────

  listProjects: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED']).optional(),
        skills: z.array(z.string()).optional(),
        budgetMin: z.number().int().nonnegative().optional(),
        budgetMax: z.number().int().positive().optional(),
        isUrgent: z.boolean().optional(),
        sortBy: z.enum(['newest', 'budget_high', 'budget_low', 'deadline']).default('newest'),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orderBy = {
        newest: { createdAt: 'desc' as const },
        budget_high: { budgetMaxAgorot: 'desc' as const },
        budget_low: { budgetMinAgorot: 'asc' as const },
        deadline: { deadline: 'asc' as const },
      }[input.sortBy];

      const projects = await ctx.prisma.project.findMany({
        where: {
          moderationStatus: 'APPROVED',
          status: input.status ?? 'OPEN',
          ...(input.isUrgent !== undefined ? { isUrgent: input.isUrgent } : {}),
          ...(input.budgetMin ? { budgetMaxAgorot: { gte: input.budgetMin } } : {}),
          ...(input.budgetMax ? { budgetMinAgorot: { lte: input.budgetMax } } : {}),
          ...(input.skills?.length ? { skills: { hasSome: input.skills } } : {}),
        },
        orderBy: [{ isFeatured: 'desc' }, orderBy],
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          client: {
            select: { id: true, displayName: true, slug: true, avatarUrl: true },
          },
          _count: { select: { proposals: true } },
        },
      });

      let nextCursor: string | undefined;
      if (projects.length > input.limit) {
        const nextItem = projects.pop();
        nextCursor = nextItem?.id;
      }

      return { projects, nextCursor };
    }),

  getProject: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findUnique({
        where: { slug: input.slug },
        include: {
          client: {
            select: { id: true, displayName: true, slug: true, avatarUrl: true, bio: true },
          },
          milestones: { orderBy: { createdAt: 'asc' } },
          _count: { select: { proposals: true, reviews: true } },
        },
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'הפרויקט לא נמצא' });
      }

      // Increment view count
      await ctx.prisma.project.update({
        where: { id: project.id },
        data: { viewCount: { increment: 1 } },
      });

      return project;
    }),

  createProject: contentMutationProcedure
    .input(
      z.object({
        title: z.string().min(5).max(200),
        description: z.string().min(50).max(5000),
        budgetMinAgorot: z.number().int().positive(),
        budgetMaxAgorot: z.number().int().positive(),
        skills: z.array(z.string()).min(1).max(10),
        deadline: z.coerce.date().optional(),
        isUrgent: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.budgetMinAgorot > input.budgetMaxAgorot) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'תקציב מינימום לא יכול להיות גבוה מתקציב מקסימום',
        });
      }

      const slug =
        input.title
          .toLowerCase()
          .replace(/[^a-z0-9\u0590-\u05FF]+/g, '-')
          .replace(/(^-|-$)/g, '')
          .slice(0, 100) +
        '-' +
        Date.now().toString(36);

      return ctx.prisma.project.create({
        data: {
          title: input.title,
          description: input.description,
          budgetMinAgorot: input.budgetMinAgorot,
          budgetMaxAgorot: input.budgetMaxAgorot,
          skills: input.skills,
          deadline: input.deadline,
          isUrgent: input.isUrgent,
          slug,
          clientId: ctx.userId!,
          status: 'OPEN',
          moderationStatus: 'PENDING',
        },
      });
    }),

  updateProject: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(5).max(200).optional(),
        description: z.string().min(50).max(5000).optional(),
        budgetMinAgorot: z.number().int().positive().optional(),
        budgetMaxAgorot: z.number().int().positive().optional(),
        skills: z.array(z.string()).min(1).max(10).optional(),
        deadline: z.coerce.date().optional(),
        status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELED']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findUnique({ where: { id: input.id } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'הפרויקט לא נמצא' });
      if (project.clientId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה לערוך פרויקט זה' });
      }

      const { id, ...data } = input;
      return ctx.prisma.project.update({ where: { id }, data });
    }),

  deleteProject: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findUnique({ where: { id: input.id } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'הפרויקט לא נמצא' });
      if (project.clientId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה למחוק פרויקט זה' });
      }
      if (project.status === 'IN_PROGRESS') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'לא ניתן למחוק פרויקט בתהליך' });
      }

      return ctx.prisma.project.update({
        where: { id: input.id },
        data: { status: 'CANCELED' },
      });
    }),

  myProjects: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        status: z.enum(['DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELED']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const projects = await ctx.prisma.project.findMany({
        where: {
          clientId: ctx.userId!,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          _count: { select: { proposals: true } },
        },
      });

      let nextCursor: string | undefined;
      if (projects.length > input.limit) {
        const nextItem = projects.pop();
        nextCursor = nextItem?.id;
      }

      return { projects, nextCursor };
    }),

  // ─── Proposals ────────────────────────────────────────

  listProposals: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        status: z.enum(['PENDING', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findUnique({ where: { id: input.projectId } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'הפרויקט לא נמצא' });
      if (project.clientId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה לצפות בהצעות' });
      }

      return ctx.prisma.proposal.findMany({
        where: {
          projectId: input.projectId,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          freelancer: {
            include: {
              user: {
                select: { id: true, displayName: true, slug: true, avatarUrl: true },
              },
            },
          },
        },
      });
    }),

  submitProposal: contentMutationProcedure
    .input(
      z.object({
        projectId: z.string(),
        coverLetter: z.string().min(50).max(3000),
        priceAgorot: z.number().int().positive(),
        estimatedDays: z.number().int().positive().max(365),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findUnique({ where: { id: input.projectId } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'הפרויקט לא נמצא' });
      if (project.status !== 'OPEN') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'הפרויקט אינו פתוח להצעות' });
      }
      if (project.clientId === ctx.userId!) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'לא ניתן להגיש הצעה לפרויקט שלך' });
      }

      const freelancer = await ctx.prisma.freelancerProfile.findUnique({
        where: { userId: ctx.userId! },
      });
      if (!freelancer) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'יש ליצור פרופיל פרילנסר לפני הגשת הצעה',
        });
      }

      const existing = await ctx.prisma.proposal.findFirst({
        where: { projectId: input.projectId, freelancerId: freelancer.id },
      });
      if (existing) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'כבר הגשת הצעה לפרויקט זה' });
      }

      const [proposal] = await ctx.prisma.$transaction([
        ctx.prisma.proposal.create({
          data: {
            projectId: input.projectId,
            freelancerId: freelancer.id,
            coverLetter: input.coverLetter,
            priceAgorot: input.priceAgorot,
            estimatedDays: input.estimatedDays,
          },
        }),
        ctx.prisma.project.update({
          where: { id: input.projectId },
          data: { proposalCount: { increment: 1 } },
        }),
      ]);

      return proposal;
    }),

  updateProposalStatus: protectedProcedure
    .input(
      z.object({
        proposalId: z.string(),
        status: z.enum(['SHORTLISTED', 'ACCEPTED', 'REJECTED']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.prisma.proposal.findUnique({
        where: { id: input.proposalId },
        include: { project: true },
      });
      if (!proposal) throw new TRPCError({ code: 'NOT_FOUND', message: 'ההצעה לא נמצאה' });
      if (proposal.project.clientId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה לעדכן הצעה זו' });
      }

      // If accepting, update project status to IN_PROGRESS
      if (input.status === 'ACCEPTED') {
        await ctx.prisma.$transaction([
          ctx.prisma.proposal.update({
            where: { id: input.proposalId },
            data: { status: 'ACCEPTED' },
          }),
          ctx.prisma.project.update({
            where: { id: proposal.projectId },
            data: { status: 'IN_PROGRESS' },
          }),
          // Reject other pending proposals
          ctx.prisma.proposal.updateMany({
            where: {
              projectId: proposal.projectId,
              id: { not: input.proposalId },
              status: { in: ['PENDING', 'SHORTLISTED'] },
            },
            data: { status: 'REJECTED' },
          }),
        ]);
      } else {
        await ctx.prisma.proposal.update({
          where: { id: input.proposalId },
          data: { status: input.status },
        });
      }

      return { success: true };
    }),

  myProposals: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const freelancer = await ctx.prisma.freelancerProfile.findUnique({
        where: { userId: ctx.userId! },
      });
      if (!freelancer) return { proposals: [], nextCursor: undefined };

      const proposals = await ctx.prisma.proposal.findMany({
        where: { freelancerId: freelancer.id },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          project: {
            include: {
              client: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (proposals.length > input.limit) {
        const nextItem = proposals.pop();
        nextCursor = nextItem?.id;
      }

      return { proposals, nextCursor };
    }),

  // ─── Freelancer Profiles ──────────────────────────────

  getFreelancerProfile: publicProcedure
    .input(z.object({ userSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { slug: input.userSlug },
        select: { id: true, displayName: true, slug: true, avatarUrl: true, bio: true, location: true },
      });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'המשתמש לא נמצא' });

      const profile = await ctx.prisma.freelancerProfile.findUnique({
        where: { userId: user.id },
        include: {
          proposals: {
            where: { status: 'ACCEPTED' },
            select: { project: { select: { id: true, title: true, slug: true } } },
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!profile) throw new TRPCError({ code: 'NOT_FOUND', message: 'פרופיל פרילנסר לא נמצא' });

      const reviews = await ctx.prisma.review.findMany({
        where: { revieweeId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          reviewer: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
          project: { select: { title: true, slug: true } },
        },
      });

      return { ...profile, user, reviews };
    }),

  createFreelancerProfile: protectedProcedure
    .input(
      z.object({
        headline: z.string().min(10).max(200),
        description: z.string().min(50).max(3000),
        hourlyRateAgorot: z.number().int().positive().optional(),
        skills: z.array(z.string()).min(1).max(20),
        availability: z.enum(['AVAILABLE', 'BUSY', 'NOT_AVAILABLE']).default('AVAILABLE'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.freelancerProfile.findUnique({
        where: { userId: ctx.userId! },
      });
      if (existing) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'כבר יש לך פרופיל פרילנסר' });
      }

      return ctx.prisma.freelancerProfile.create({
        data: {
          userId: ctx.userId!,
          headline: input.headline,
          description: input.description,
          hourlyRateAgorot: input.hourlyRateAgorot,
          skills: input.skills,
          availability: input.availability,
        },
      });
    }),

  updateFreelancerProfile: protectedProcedure
    .input(
      z.object({
        headline: z.string().min(10).max(200).optional(),
        description: z.string().min(50).max(3000).optional(),
        hourlyRateAgorot: z.number().int().positive().optional(),
        skills: z.array(z.string()).min(1).max(20).optional(),
        availability: z.enum(['AVAILABLE', 'BUSY', 'NOT_AVAILABLE']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.freelancerProfile.findUnique({
        where: { userId: ctx.userId! },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'פרופיל פרילנסר לא נמצא' });
      }

      return ctx.prisma.freelancerProfile.update({
        where: { userId: ctx.userId! },
        data: input,
      });
    }),

  myFreelancerProfile: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.freelancerProfile.findUnique({
      where: { userId: ctx.userId! },
    });
  }),

  listFreelancers: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        skills: z.array(z.string()).optional(),
        availability: z.enum(['AVAILABLE', 'BUSY', 'NOT_AVAILABLE']).optional(),
        sortBy: z.enum(['rating', 'completed', 'rate_low', 'rate_high']).default('rating'),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orderBy = {
        rating: { averageRating: 'desc' as const },
        completed: { completedProjects: 'desc' as const },
        rate_low: { hourlyRateAgorot: 'asc' as const },
        rate_high: { hourlyRateAgorot: 'desc' as const },
      }[input.sortBy];

      const profiles = await ctx.prisma.freelancerProfile.findMany({
        where: {
          ...(input.availability ? { availability: input.availability } : { availability: 'AVAILABLE' }),
          ...(input.skills?.length ? { skills: { hasSome: input.skills } } : {}),
        },
        orderBy,
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          user: {
            select: { id: true, displayName: true, slug: true, avatarUrl: true, location: true },
          },
        },
      });

      let nextCursor: string | undefined;
      if (profiles.length > input.limit) {
        const nextItem = profiles.pop();
        nextCursor = nextItem?.id;
      }

      return { profiles, nextCursor };
    }),

  // ─── Reviews ──────────────────────────────────────────

  createReview: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        revieweeId: z.string(),
        rating: z.number().int().min(1).max(5),
        communicationRating: z.number().int().min(1).max(5).optional(),
        qualityRating: z.number().int().min(1).max(5).optional(),
        timelinessRating: z.number().int().min(1).max(5).optional(),
        comment: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findUnique({ where: { id: input.projectId } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'הפרויקט לא נמצא' });
      if (project.status !== 'COMPLETED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'ניתן לכתוב ביקורת רק לפרויקט שהושלם' });
      }

      const existing = await ctx.prisma.review.findFirst({
        where: { projectId: input.projectId, reviewerId: ctx.userId! },
      });
      if (existing) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'כבר כתבת ביקורת לפרויקט זה' });
      }

      const review = await ctx.prisma.review.create({
        data: {
          projectId: input.projectId,
          reviewerId: ctx.userId!,
          revieweeId: input.revieweeId,
          rating: input.rating,
          communicationRating: input.communicationRating,
          qualityRating: input.qualityRating,
          timelinessRating: input.timelinessRating,
          comment: input.comment,
        },
      });

      // Update freelancer average rating
      const avgRating = await ctx.prisma.review.aggregate({
        where: { revieweeId: input.revieweeId },
        _avg: { rating: true },
      });

      if (avgRating._avg.rating) {
        await ctx.prisma.freelancerProfile.updateMany({
          where: { userId: input.revieweeId },
          data: { averageRating: avgRating._avg.rating },
        });
      }

      return review;
    }),

  // ─── Milestones ───────────────────────────────────────

  createMilestone: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().min(3).max(200),
        description: z.string().min(10).max(1000),
        amountAgorot: z.number().int().positive(),
        dueDate: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findUnique({ where: { id: input.projectId } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'הפרויקט לא נמצא' });
      if (project.clientId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'רק מפרסם הפרויקט יכול ליצור אבני דרך' });
      }

      return ctx.prisma.milestone.create({
        data: {
          projectId: input.projectId,
          title: input.title,
          description: input.description,
          amountAgorot: input.amountAgorot,
          dueDate: input.dueDate,
        },
      });
    }),

  updateMilestoneStatus: protectedProcedure
    .input(
      z.object({
        milestoneId: z.string(),
        status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'APPROVED']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const milestone = await ctx.prisma.milestone.findUnique({
        where: { id: input.milestoneId },
        include: { project: true },
      });
      if (!milestone) throw new TRPCError({ code: 'NOT_FOUND', message: 'אבן הדרך לא נמצאה' });
      if (milestone.project.clientId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה לעדכן אבן דרך זו' });
      }

      return ctx.prisma.milestone.update({
        where: { id: input.milestoneId },
        data: {
          status: input.status,
          ...(input.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
        },
      });
    }),

  // ─── AI Job Matching ──────────────────────────────────

  getRecommendedProjects: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(5) }))
    .query(async ({ ctx, input }) => {
      // Dynamic import to avoid loading AI package when not needed
      const { getRecommendedProjectsForFreelancer } = await import('@platform/ai/src/recommendations');
      return getRecommendedProjectsForFreelancer(ctx.prisma, ctx.userId!, input.limit);
    }),

  getRecommendedFreelancers: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number().min(1).max(20).default(5),
      }),
    )
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findUnique({ where: { id: input.projectId } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'הפרויקט לא נמצא' });
      if (project.clientId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה לצפות בהמלצות' });
      }

      const { getRecommendedFreelancersForProject } = await import('@platform/ai/src/recommendations');
      return getRecommendedFreelancersForProject(ctx.prisma, input.projectId, input.limit);
    }),

  // ─── Stripe Connect ───────────────────────────────────

  createConnectAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const freelancer = await ctx.prisma.freelancerProfile.findUnique({
      where: { userId: ctx.userId! },
    });
    if (!freelancer) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'יש ליצור פרופיל פרילנסר קודם' });
    }
    if (freelancer.stripeConnectAccountId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'כבר יש לך חשבון Stripe Connect' });
    }

    const user = await ctx.prisma.user.findUnique({ where: { id: ctx.userId! } });
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'המשתמש לא נמצא' });

    const { createConnectAccount } = await import('@platform/payments');
    const account = await createConnectAccount(ctx.userId!, user.email);

    await ctx.prisma.freelancerProfile.update({
      where: { userId: ctx.userId! },
      data: { stripeConnectAccountId: account.id },
    });

    return { accountId: account.id };
  }),

  getConnectOnboardingLink: protectedProcedure.mutation(async ({ ctx }) => {
    const freelancer = await ctx.prisma.freelancerProfile.findUnique({
      where: { userId: ctx.userId! },
    });
    if (!freelancer?.stripeConnectAccountId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'אין חשבון Stripe Connect' });
    }

    const { createAccountLink } = await import('@platform/payments');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const link = await createAccountLink(
      freelancer.stripeConnectAccountId,
      `${appUrl}/marketplace/connect/refresh`,
      `${appUrl}/marketplace/connect/return`,
    );

    return { url: link.url };
  }),

  // ─── Escrow Payment ───────────────────────────────────

  fundMilestone: protectedProcedure
    .input(z.object({ milestoneId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const milestone = await ctx.prisma.milestone.findUnique({
        where: { id: input.milestoneId },
        include: { project: true },
      });
      if (!milestone) throw new TRPCError({ code: 'NOT_FOUND', message: 'אבן הדרך לא נמצאה' });
      if (milestone.project.clientId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'רק מפרסם הפרויקט יכול לממן אבני דרך' });
      }

      // Find the accepted freelancer
      const acceptedProposal = await ctx.prisma.proposal.findFirst({
        where: { projectId: milestone.projectId, status: 'ACCEPTED' },
        include: { freelancer: true },
      });
      if (!acceptedProposal) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'אין פרילנסר מאושר לפרויקט זה' });
      }

      const { createEscrowPayment } = await import('@platform/payments');
      const escrow = await createEscrowPayment({
        amountAgorot: milestone.amountAgorot,
        milestoneId: milestone.id,
        payerId: ctx.userId!,
        payeeId: acceptedProposal.freelancer.userId,
      });

      // Create transaction record
      await ctx.prisma.transaction.create({
        data: {
          milestoneId: milestone.id,
          payerId: ctx.userId!,
          payeeId: acceptedProposal.freelancer.userId,
          amountAgorot: milestone.amountAgorot,
          platformFeeAgorot: Math.round(milestone.amountAgorot * 0.1), // 10% platform fee
          status: 'PENDING_FUNDING',
          stripePaymentIntentId: escrow.paymentIntentId,
        },
      });

      return { clientSecret: escrow.clientSecret };
    }),

  releaseMilestone: protectedProcedure
    .input(z.object({ milestoneId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const milestone = await ctx.prisma.milestone.findUnique({
        where: { id: input.milestoneId },
        include: {
          project: true,
          transactions: { where: { status: 'FUNDED' } },
        },
      });
      if (!milestone) throw new TRPCError({ code: 'NOT_FOUND', message: 'אבן הדרך לא נמצאה' });
      if (milestone.project.clientId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'רק מפרסם הפרויקט יכול לשחרר תשלום' });
      }

      const transaction = milestone.transactions[0];
      if (!transaction?.stripePaymentIntentId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'אין תשלום ממתין לשחרור' });
      }

      const { captureEscrowPayment } = await import('@platform/payments');
      await captureEscrowPayment(transaction.stripePaymentIntentId);

      await ctx.prisma.$transaction([
        ctx.prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'RELEASED' },
        }),
        ctx.prisma.milestone.update({
          where: { id: input.milestoneId },
          data: { status: 'APPROVED', completedAt: new Date() },
        }),
      ]);

      return { success: true };
    }),
});

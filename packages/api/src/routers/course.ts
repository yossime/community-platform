import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  contentMutationProcedure,
} from '../trpc';

export const courseRouter = createTRPCRouter({
  // ─── Public Queries ──────────────────────────────────

  list: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
        isFree: z.boolean().optional(),
        sortBy: z.enum(['newest', 'popular', 'rating', 'price_low', 'price_high']).default('newest'),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orderBy = {
        newest: { createdAt: 'desc' as const },
        popular: { enrollmentCount: 'desc' as const },
        rating: { averageRating: 'desc' as const },
        price_low: { priceAgorot: 'asc' as const },
        price_high: { priceAgorot: 'desc' as const },
      }[input.sortBy];

      const courses = await ctx.prisma.course.findMany({
        where: {
          isPublished: true,
          moderationStatus: 'APPROVED',
          ...(input.level ? { level: input.level } : {}),
          ...(input.isFree !== undefined ? { isFree: input.isFree } : {}),
          ...(input.search
            ? {
                OR: [
                  { title: { contains: input.search, mode: 'insensitive' as const } },
                  { shortDescription: { contains: input.search, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        orderBy,
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          instructor: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
          _count: { select: { modules: true, enrollments: true, reviews: true } },
        },
      });

      let nextCursor: string | undefined;
      if (courses.length > input.limit) {
        const nextItem = courses.pop();
        nextCursor = nextItem?.id;
      }

      return { courses, nextCursor };
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const course = await ctx.prisma.course.findUnique({
        where: { slug: input.slug },
        include: {
          instructor: { select: { id: true, displayName: true, slug: true, avatarUrl: true, bio: true } },
          modules: {
            orderBy: { displayOrder: 'asc' },
            include: {
              lessons: {
                orderBy: { displayOrder: 'asc' },
                select: {
                  id: true,
                  title: true,
                  type: true,
                  videoDurationSeconds: true,
                  displayOrder: true,
                  isFree: true,
                },
              },
            },
          },
          reviews: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
          },
          _count: { select: { enrollments: true, reviews: true } },
        },
      });

      if (!course) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'הקורס לא נמצא' });
      }

      // Calculate total lessons and duration
      const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);
      const totalDuration = course.modules.reduce(
        (acc, m) => acc + m.lessons.reduce((la, l) => la + (l.videoDurationSeconds ?? 0), 0),
        0,
      );

      return { ...course, totalLessons, totalDuration };
    }),

  // ─── Enrollment ──────────────────────────────────────

  getEnrollment: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.enrollment.findUnique({
        where: { courseId_userId: { courseId: input.courseId, userId: ctx.userId! } },
        include: {
          lessonProgress: true,
          certificate: true,
        },
      });
    }),

  enroll: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.prisma.course.findUnique({
        where: { id: input.courseId },
        include: { modules: { include: { lessons: true } } },
      });
      if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: 'הקורס לא נמצא' });
      if (!course.isPublished) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'הקורס אינו זמין להרשמה' });
      }
      if (course.instructorId === ctx.userId!) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'לא ניתן להירשם לקורס שלך' });
      }

      const existing = await ctx.prisma.enrollment.findUnique({
        where: { courseId_userId: { courseId: input.courseId, userId: ctx.userId! } },
      });
      if (existing) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'כבר נרשמת לקורס זה' });
      }

      if (!course.isFree && course.priceAgorot > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'קורס זה דורש תשלום. אנא השתמש בתהליך התשלום',
        });
      }

      const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);

      const [enrollment] = await ctx.prisma.$transaction([
        ctx.prisma.enrollment.create({
          data: {
            courseId: input.courseId,
            userId: ctx.userId!,
            totalLessons,
          },
        }),
        ctx.prisma.course.update({
          where: { id: input.courseId },
          data: { enrollmentCount: { increment: 1 } },
        }),
      ]);

      return enrollment;
    }),

  myEnrollments: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        status: z.enum(['ACTIVE', 'COMPLETED', 'PAUSED']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const enrollments = await ctx.prisma.enrollment.findMany({
        where: {
          userId: ctx.userId!,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: { enrolledAt: 'desc' },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          course: {
            include: {
              instructor: { select: { id: true, displayName: true, slug: true, avatarUrl: true } },
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (enrollments.length > input.limit) {
        const nextItem = enrollments.pop();
        nextCursor = nextItem?.id;
      }

      return { enrollments, nextCursor };
    }),

  // ─── Lesson Progress ─────────────────────────────────

  getLesson: protectedProcedure
    .input(z.object({ lessonId: z.string(), courseId: z.string() }))
    .query(async ({ ctx, input }) => {
      const enrollment = await ctx.prisma.enrollment.findUnique({
        where: { courseId_userId: { courseId: input.courseId, userId: ctx.userId! } },
      });

      const lesson = await ctx.prisma.lesson.findUnique({
        where: { id: input.lessonId },
        include: { module: { include: { course: true } } },
      });
      if (!lesson) throw new TRPCError({ code: 'NOT_FOUND', message: 'השיעור לא נמצא' });

      // Allow free lessons or enrolled users
      if (!lesson.isFree && !enrollment) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'יש להירשם לקורס כדי לצפות בשיעור זה' });
      }

      const progress = enrollment
        ? await ctx.prisma.lessonProgress.findUnique({
            where: { lessonId_enrollmentId: { lessonId: input.lessonId, enrollmentId: enrollment.id } },
          })
        : null;

      return { lesson, progress };
    }),

  completeLesson: protectedProcedure
    .input(
      z.object({
        lessonId: z.string(),
        courseId: z.string(),
        timeSpentSeconds: z.number().int().nonnegative().default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const enrollment = await ctx.prisma.enrollment.findUnique({
        where: { courseId_userId: { courseId: input.courseId, userId: ctx.userId! } },
      });
      if (!enrollment) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'אינך רשום לקורס זה' });
      }

      const existingProgress = await ctx.prisma.lessonProgress.findUnique({
        where: { lessonId_enrollmentId: { lessonId: input.lessonId, enrollmentId: enrollment.id } },
      });

      if (existingProgress?.completed) {
        // Already completed, just update time
        return ctx.prisma.lessonProgress.update({
          where: { id: existingProgress.id },
          data: { timeSpentSeconds: { increment: input.timeSpentSeconds } },
        });
      }

      const progress = await ctx.prisma.lessonProgress.upsert({
        where: { lessonId_enrollmentId: { lessonId: input.lessonId, enrollmentId: enrollment.id } },
        create: {
          lessonId: input.lessonId,
          enrollmentId: enrollment.id,
          completed: true,
          completedAt: new Date(),
          timeSpentSeconds: input.timeSpentSeconds,
        },
        update: {
          completed: true,
          completedAt: new Date(),
          timeSpentSeconds: { increment: input.timeSpentSeconds },
        },
      });

      // Update enrollment progress
      const completedCount = await ctx.prisma.lessonProgress.count({
        where: { enrollmentId: enrollment.id, completed: true },
      });
      const progressPercent = enrollment.totalLessons > 0 ? completedCount / enrollment.totalLessons : 0;

      const enrollmentUpdate: Record<string, unknown> = {
        completedLessons: completedCount,
        progress: progressPercent,
      };

      if (progressPercent >= 1) {
        enrollmentUpdate.status = 'COMPLETED';
        enrollmentUpdate.completedAt = new Date();
      }

      await ctx.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: enrollmentUpdate,
      });

      return progress;
    }),

  submitQuiz: protectedProcedure
    .input(
      z.object({
        lessonId: z.string(),
        courseId: z.string(),
        answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const enrollment = await ctx.prisma.enrollment.findUnique({
        where: { courseId_userId: { courseId: input.courseId, userId: ctx.userId! } },
      });
      if (!enrollment) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'אינך רשום לקורס זה' });
      }

      const lesson = await ctx.prisma.lesson.findUnique({ where: { id: input.lessonId } });
      if (!lesson || lesson.type !== 'QUIZ') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'שיעור זה אינו מבחן' });
      }

      // Calculate score from quiz data
      const quizData = lesson.quizData as { questions: Array<{ id: string; correctAnswer: string | string[] }> } | null;
      if (!quizData?.questions) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'נתוני המבחן חסרים' });
      }

      let correct = 0;
      for (const question of quizData.questions) {
        const userAnswer = input.answers[question.id];
        if (JSON.stringify(userAnswer) === JSON.stringify(question.correctAnswer)) {
          correct++;
        }
      }
      const score = quizData.questions.length > 0 ? (correct / quizData.questions.length) * 100 : 0;

      const progress = await ctx.prisma.lessonProgress.upsert({
        where: { lessonId_enrollmentId: { lessonId: input.lessonId, enrollmentId: enrollment.id } },
        create: {
          lessonId: input.lessonId,
          enrollmentId: enrollment.id,
          completed: score >= 70,
          score,
          completedAt: score >= 70 ? new Date() : null,
        },
        update: {
          score,
          completed: score >= 70,
          completedAt: score >= 70 ? new Date() : null,
        },
      });

      return { score, passed: score >= 70, progress };
    }),

  // ─── Reviews ─────────────────────────────────────────

  createReview: protectedProcedure
    .input(
      z.object({
        courseId: z.string(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const enrollment = await ctx.prisma.enrollment.findUnique({
        where: { courseId_userId: { courseId: input.courseId, userId: ctx.userId! } },
      });
      if (!enrollment) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'יש להירשם לקורס לפני כתיבת ביקורת' });
      }

      const existing = await ctx.prisma.courseReview.findUnique({
        where: { courseId_userId: { courseId: input.courseId, userId: ctx.userId! } },
      });
      if (existing) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'כבר כתבת ביקורת לקורס זה' });
      }

      const review = await ctx.prisma.courseReview.create({
        data: {
          courseId: input.courseId,
          userId: ctx.userId!,
          rating: input.rating,
          comment: input.comment,
        },
      });

      // Update average rating
      const avgRating = await ctx.prisma.courseReview.aggregate({
        where: { courseId: input.courseId },
        _avg: { rating: true },
      });

      if (avgRating._avg.rating) {
        await ctx.prisma.course.update({
          where: { id: input.courseId },
          data: { averageRating: avgRating._avg.rating },
        });
      }

      return review;
    }),

  // ─── Instructor (Course Management) ──────────────────

  myCreatedCourses: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const courses = await ctx.prisma.course.findMany({
        where: { instructorId: ctx.userId! },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          _count: { select: { enrollments: true, reviews: true, modules: true } },
        },
      });

      let nextCursor: string | undefined;
      if (courses.length > input.limit) {
        const nextItem = courses.pop();
        nextCursor = nextItem?.id;
      }

      return { courses, nextCursor };
    }),

  create: contentMutationProcedure
    .input(
      z.object({
        title: z.string().min(5).max(200),
        description: z.string().min(50).max(10000),
        shortDescription: z.string().min(10).max(300),
        level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
        priceAgorot: z.number().int().nonnegative().default(0),
        isFree: z.boolean().default(false),
        coverImageUrl: z.string().url().optional(),
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

      return ctx.prisma.course.create({
        data: {
          title: input.title,
          description: input.description,
          shortDescription: input.shortDescription,
          level: input.level,
          priceAgorot: input.priceAgorot,
          isFree: input.isFree,
          coverImageUrl: input.coverImageUrl ?? null,
          slug,
          instructorId: ctx.userId!,
          moderationStatus: 'PENDING',
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(5).max(200).optional(),
        description: z.string().min(50).max(10000).optional(),
        shortDescription: z.string().min(10).max(300).optional(),
        level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
        priceAgorot: z.number().int().nonnegative().optional(),
        isFree: z.boolean().optional(),
        coverImageUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.prisma.course.findUnique({ where: { id: input.id } });
      if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: 'הקורס לא נמצא' });
      if (course.instructorId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה לערוך קורס זה' });
      }

      const { id, ...data } = input;
      return ctx.prisma.course.update({ where: { id }, data });
    }),

  publish: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.prisma.course.findUnique({
        where: { id: input.id },
        include: { modules: { include: { lessons: true } } },
      });
      if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: 'הקורס לא נמצא' });
      if (course.instructorId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה לפרסם קורס זה' });
      }

      const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);
      if (totalLessons === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'יש להוסיף לפחות שיעור אחד לפני פרסום' });
      }

      return ctx.prisma.course.update({
        where: { id: input.id },
        data: { isPublished: true, moderationStatus: 'PENDING' },
      });
    }),

  // ─── Modules ─────────────────────────────────────────

  addModule: protectedProcedure
    .input(
      z.object({
        courseId: z.string(),
        title: z.string().min(3).max(200),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.prisma.course.findUnique({ where: { id: input.courseId } });
      if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: 'הקורס לא נמצא' });
      if (course.instructorId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה לערוך קורס זה' });
      }

      const lastModule = await ctx.prisma.courseModule.findFirst({
        where: { courseId: input.courseId },
        orderBy: { displayOrder: 'desc' },
      });

      return ctx.prisma.courseModule.create({
        data: {
          courseId: input.courseId,
          title: input.title,
          description: input.description,
          displayOrder: (lastModule?.displayOrder ?? -1) + 1,
        },
      });
    }),

  updateModule: protectedProcedure
    .input(
      z.object({
        moduleId: z.string(),
        title: z.string().min(3).max(200).optional(),
        description: z.string().max(500).optional(),
        displayOrder: z.number().int().nonnegative().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const module = await ctx.prisma.courseModule.findUnique({
        where: { id: input.moduleId },
        include: { course: true },
      });
      if (!module) throw new TRPCError({ code: 'NOT_FOUND', message: 'המודול לא נמצא' });
      if (module.course.instructorId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה לערוך מודול זה' });
      }

      const { moduleId, ...data } = input;
      return ctx.prisma.courseModule.update({ where: { id: moduleId }, data });
    }),

  deleteModule: protectedProcedure
    .input(z.object({ moduleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const module = await ctx.prisma.courseModule.findUnique({
        where: { id: input.moduleId },
        include: { course: true },
      });
      if (!module) throw new TRPCError({ code: 'NOT_FOUND', message: 'המודול לא נמצא' });
      if (module.course.instructorId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה למחוק מודול זה' });
      }

      return ctx.prisma.courseModule.delete({ where: { id: input.moduleId } });
    }),

  // ─── Lessons ─────────────────────────────────────────

  addLesson: protectedProcedure
    .input(
      z.object({
        moduleId: z.string(),
        title: z.string().min(3).max(200),
        type: z.enum(['VIDEO', 'TEXT', 'QUIZ', 'ASSIGNMENT']),
        content: z.string().optional(),
        videoUrl: z.string().url().optional(),
        videoDurationSeconds: z.number().int().positive().optional(),
        quizData: z.any().optional(),
        assignmentData: z.any().optional(),
        isFree: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const module = await ctx.prisma.courseModule.findUnique({
        where: { id: input.moduleId },
        include: { course: true },
      });
      if (!module) throw new TRPCError({ code: 'NOT_FOUND', message: 'המודול לא נמצא' });
      if (module.course.instructorId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה להוסיף שיעורים' });
      }

      const lastLesson = await ctx.prisma.lesson.findFirst({
        where: { moduleId: input.moduleId },
        orderBy: { displayOrder: 'desc' },
      });

      return ctx.prisma.lesson.create({
        data: {
          moduleId: input.moduleId,
          title: input.title,
          type: input.type,
          content: input.content,
          videoUrl: input.videoUrl,
          videoDurationSeconds: input.videoDurationSeconds,
          quizData: input.quizData,
          assignmentData: input.assignmentData,
          isFree: input.isFree,
          displayOrder: (lastLesson?.displayOrder ?? -1) + 1,
        },
      });
    }),

  updateLesson: protectedProcedure
    .input(
      z.object({
        lessonId: z.string(),
        title: z.string().min(3).max(200).optional(),
        content: z.string().optional(),
        videoUrl: z.string().url().optional(),
        videoDurationSeconds: z.number().int().positive().optional(),
        quizData: z.any().optional(),
        assignmentData: z.any().optional(),
        isFree: z.boolean().optional(),
        displayOrder: z.number().int().nonnegative().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const lesson = await ctx.prisma.lesson.findUnique({
        where: { id: input.lessonId },
        include: { module: { include: { course: true } } },
      });
      if (!lesson) throw new TRPCError({ code: 'NOT_FOUND', message: 'השיעור לא נמצא' });
      if (lesson.module.course.instructorId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה לערוך שיעור זה' });
      }

      const { lessonId, ...data } = input;
      return ctx.prisma.lesson.update({ where: { id: lessonId }, data });
    }),

  deleteLesson: protectedProcedure
    .input(z.object({ lessonId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const lesson = await ctx.prisma.lesson.findUnique({
        where: { id: input.lessonId },
        include: { module: { include: { course: true } } },
      });
      if (!lesson) throw new TRPCError({ code: 'NOT_FOUND', message: 'השיעור לא נמצא' });
      if (lesson.module.course.instructorId !== ctx.userId!) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'אין לך הרשאה למחוק שיעור זה' });
      }

      return ctx.prisma.lesson.delete({ where: { id: input.lessonId } });
    }),
});

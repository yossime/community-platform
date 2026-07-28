import { z } from 'zod';

// ─── Notification Event Types ───────────────────────

export const notificationTypeSchema = z.enum([
  'new_reply',
  'new_proposal',
  'payment_received',
  'payment_released',
  'milestone_completed',
  'course_enrolled',
  'moderation_result',
  'weekly_digest',
  'welcome',
]);

export type NotificationEventType = z.infer<typeof notificationTypeSchema>;

// ─── Per-Type Data Schemas ──────────────────────────

const newReplyDataSchema = z.object({
  threadId: z.string().min(1),
  threadTitle: z.string().min(1),
  postId: z.string().min(1),
  authorName: z.string().min(1),
  excerpt: z.string().optional(),
});

const newProposalDataSchema = z.object({
  projectId: z.string().min(1),
  projectTitle: z.string().min(1),
  proposalId: z.string().min(1),
  freelancerName: z.string().min(1),
  amount: z.number().int().nonnegative(), // agorot
});

const paymentReceivedDataSchema = z.object({
  transactionId: z.string().min(1),
  projectTitle: z.string().min(1),
  amount: z.number().int().positive(), // agorot
  payerName: z.string().min(1),
});

const paymentReleasedDataSchema = z.object({
  transactionId: z.string().min(1),
  milestoneTitle: z.string().min(1),
  amount: z.number().int().positive(), // agorot
  projectTitle: z.string().min(1),
});

const milestoneCompletedDataSchema = z.object({
  milestoneId: z.string().min(1),
  milestoneTitle: z.string().min(1),
  projectId: z.string().min(1),
  projectTitle: z.string().min(1),
  freelancerName: z.string().min(1),
});

const courseEnrolledDataSchema = z.object({
  courseId: z.string().min(1),
  courseTitle: z.string().min(1),
  instructorName: z.string().min(1),
});

const moderationResultDataSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  entityTitle: z.string().optional(),
  result: z.enum(['APPROVED', 'REJECTED', 'FLAGGED']),
  reason: z.string().optional(),
});

const weeklyDigestDataSchema = z.object({
  newThreadsCount: z.number().int().nonnegative(),
  newProjectsCount: z.number().int().nonnegative(),
  newArticlesCount: z.number().int().nonnegative(),
  unreadNotificationsCount: z.number().int().nonnegative(),
});

const welcomeDataSchema = z.object({
  displayName: z.string().min(1),
});

// ─── Discriminated Union: Notification Payloads ─────

const newReplyPayloadSchema = z.object({
  type: z.literal('new_reply'),
  userId: z.string().min(1),
  data: newReplyDataSchema,
});

const newProposalPayloadSchema = z.object({
  type: z.literal('new_proposal'),
  userId: z.string().min(1),
  data: newProposalDataSchema,
});

const paymentReceivedPayloadSchema = z.object({
  type: z.literal('payment_received'),
  userId: z.string().min(1),
  data: paymentReceivedDataSchema,
});

const paymentReleasedPayloadSchema = z.object({
  type: z.literal('payment_released'),
  userId: z.string().min(1),
  data: paymentReleasedDataSchema,
});

const milestoneCompletedPayloadSchema = z.object({
  type: z.literal('milestone_completed'),
  userId: z.string().min(1),
  data: milestoneCompletedDataSchema,
});

const courseEnrolledPayloadSchema = z.object({
  type: z.literal('course_enrolled'),
  userId: z.string().min(1),
  data: courseEnrolledDataSchema,
});

const moderationResultPayloadSchema = z.object({
  type: z.literal('moderation_result'),
  userId: z.string().min(1),
  data: moderationResultDataSchema,
});

const weeklyDigestPayloadSchema = z.object({
  type: z.literal('weekly_digest'),
  userId: z.string().min(1),
  data: weeklyDigestDataSchema,
});

const welcomePayloadSchema = z.object({
  type: z.literal('welcome'),
  userId: z.string().min(1),
  data: welcomeDataSchema,
});

export const notificationPayloadSchema = z.discriminatedUnion('type', [
  newReplyPayloadSchema,
  newProposalPayloadSchema,
  paymentReceivedPayloadSchema,
  paymentReleasedPayloadSchema,
  milestoneCompletedPayloadSchema,
  courseEnrolledPayloadSchema,
  moderationResultPayloadSchema,
  weeklyDigestPayloadSchema,
  welcomePayloadSchema,
]);

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;
export type NewReplyPayload = z.infer<typeof newReplyPayloadSchema>;
export type NewProposalPayload = z.infer<typeof newProposalPayloadSchema>;
export type PaymentReceivedPayload = z.infer<typeof paymentReceivedPayloadSchema>;
export type PaymentReleasedPayload = z.infer<typeof paymentReleasedPayloadSchema>;
export type MilestoneCompletedPayload = z.infer<typeof milestoneCompletedPayloadSchema>;
export type CourseEnrolledPayload = z.infer<typeof courseEnrolledPayloadSchema>;
export type ModerationResultPayload = z.infer<typeof moderationResultPayloadSchema>;
export type WeeklyDigestPayload = z.infer<typeof weeklyDigestPayloadSchema>;
export type WelcomePayload = z.infer<typeof welcomePayloadSchema>;

// ─── Template Output ────────────────────────────────

export interface NotificationTemplate {
  subject: string;
  body: string;
  link: string;
}

// ─── Prisma NotificationType mapping ────────────────

/**
 * Maps our SQS event types to the Prisma NotificationType enum values.
 * These must match the enum values defined in schema.prisma.
 */
export const EVENT_TO_DB_TYPE: Record<NotificationEventType, string> = {
  new_reply: 'THREAD_REPLY',
  new_proposal: 'PROPOSAL_RECEIVED',
  payment_received: 'MILESTONE_FUNDED',
  payment_released: 'MILESTONE_RELEASED',
  milestone_completed: 'MILESTONE_FUNDED',
  course_enrolled: 'COURSE_ENROLLED',
  moderation_result: 'CONTENT_MODERATED',
  weekly_digest: 'WEEKLY_DIGEST',
  welcome: 'SYSTEM_ANNOUNCEMENT',
} as const;

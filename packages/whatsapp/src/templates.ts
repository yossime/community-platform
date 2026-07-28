import { sendWhatsAppTemplate } from './client';

// ─── Template Names (must be registered in Meta Business Manager) ──

export const TEMPLATES = {
  OTP_VERIFICATION: 'otp_verification',
  WELCOME: 'welcome_message',
  NEW_MESSAGE: 'new_message_notification',
  PROPOSAL_RECEIVED: 'proposal_received',
  PROPOSAL_ACCEPTED: 'proposal_accepted',
  MILESTONE_FUNDED: 'milestone_funded',
  MILESTONE_RELEASED: 'milestone_released',
  COURSE_ENROLLED: 'course_enrolled',
  LISTING_EXPIRING: 'listing_expiring',
  WEEKLY_DIGEST: 'weekly_digest',
} as const;

// ─── Notification Senders ──────────────────────────────

export async function sendOtpNotification(phone: string, code: string) {
  return sendWhatsAppTemplate(phone, TEMPLATES.OTP_VERIFICATION, [code]);
}

export async function sendWelcomeNotification(phone: string, displayName: string) {
  return sendWhatsAppTemplate(phone, TEMPLATES.WELCOME, [displayName]);
}

export async function sendNewMessageNotification(
  phone: string,
  senderName: string,
  preview: string,
) {
  return sendWhatsAppTemplate(phone, TEMPLATES.NEW_MESSAGE, [
    senderName,
    preview.slice(0, 100),
  ]);
}

export async function sendProposalReceivedNotification(
  phone: string,
  projectTitle: string,
  freelancerName: string,
) {
  return sendWhatsAppTemplate(phone, TEMPLATES.PROPOSAL_RECEIVED, [
    projectTitle,
    freelancerName,
  ]);
}

export async function sendProposalAcceptedNotification(
  phone: string,
  projectTitle: string,
  clientName: string,
) {
  return sendWhatsAppTemplate(phone, TEMPLATES.PROPOSAL_ACCEPTED, [
    projectTitle,
    clientName,
  ]);
}

export async function sendMilestoneFundedNotification(
  phone: string,
  milestoneTitle: string,
  amount: string,
) {
  return sendWhatsAppTemplate(phone, TEMPLATES.MILESTONE_FUNDED, [
    milestoneTitle,
    amount,
  ]);
}

export async function sendMilestoneReleasedNotification(
  phone: string,
  milestoneTitle: string,
  amount: string,
) {
  return sendWhatsAppTemplate(phone, TEMPLATES.MILESTONE_RELEASED, [
    milestoneTitle,
    amount,
  ]);
}

export async function sendCourseEnrolledNotification(
  phone: string,
  courseName: string,
  instructorName: string,
) {
  return sendWhatsAppTemplate(phone, TEMPLATES.COURSE_ENROLLED, [
    courseName,
    instructorName,
  ]);
}

export async function sendListingExpiringNotification(
  phone: string,
  listingTitle: string,
  daysLeft: string,
) {
  return sendWhatsAppTemplate(phone, TEMPLATES.LISTING_EXPIRING, [
    listingTitle,
    daysLeft,
  ]);
}

export async function sendWeeklyDigest(
  phone: string,
  newThreads: string,
  newProjects: string,
) {
  return sendWhatsAppTemplate(phone, TEMPLATES.WEEKLY_DIGEST, [
    newThreads,
    newProjects,
  ]);
}

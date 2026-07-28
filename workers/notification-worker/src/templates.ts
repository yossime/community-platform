import type {
  NotificationPayload,
  NotificationTemplate,
  NewReplyPayload,
  NewProposalPayload,
  PaymentReceivedPayload,
  PaymentReleasedPayload,
  MilestoneCompletedPayload,
  CourseEnrolledPayload,
  ModerationResultPayload,
  WeeklyDigestPayload,
  WelcomePayload,
} from './types';

// ─── Currency Formatting ────────────────────────────

/**
 * Formats an amount in agorot to a human-readable ILS string.
 * E.g., 4900 → "₪49.00"
 */
function formatILS(agorot: number): string {
  const shekel = (agorot / 100).toFixed(2);
  return `₪${shekel}`;
}

// ─── App URL ────────────────────────────────────────

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://platform.co.il';

// ─── Template Generators ────────────────────────────

function newReplyTemplate(payload: NewReplyPayload): NotificationTemplate {
  const { threadTitle, authorName } = payload.data;
  return {
    subject: 'תגובה חדשה לדיון שלך',
    body: `${authorName} הגיב/ה לדיון "${threadTitle}"`,
    link: `${APP_URL}/forums/thread/${payload.data.threadId}#post-${payload.data.postId}`,
  };
}

function newProposalTemplate(payload: NewProposalPayload): NotificationTemplate {
  const { projectTitle, freelancerName, amount } = payload.data;
  return {
    subject: 'הצעה חדשה לפרויקט שלך',
    body: `${freelancerName} שלח/ה הצעה בסך ${formatILS(amount)} לפרויקט "${projectTitle}"`,
    link: `${APP_URL}/marketplace/${payload.data.projectId}`,
  };
}

function paymentReceivedTemplate(payload: PaymentReceivedPayload): NotificationTemplate {
  const { projectTitle, amount, payerName } = payload.data;
  return {
    subject: 'תשלום התקבל',
    body: `התקבל תשלום בסך ${formatILS(amount)} מ-${payerName} עבור הפרויקט "${projectTitle}"`,
    link: `${APP_URL}/marketplace/${payload.data.transactionId}`,
  };
}

function paymentReleasedTemplate(payload: PaymentReleasedPayload): NotificationTemplate {
  const { milestoneTitle, amount, projectTitle } = payload.data;
  return {
    subject: 'תשלום שוחרר',
    body: `שוחרר תשלום בסך ${formatILS(amount)} עבור אבן הדרך "${milestoneTitle}" בפרויקט "${projectTitle}"`,
    link: `${APP_URL}/marketplace/${payload.data.transactionId}`,
  };
}

function milestoneCompletedTemplate(payload: MilestoneCompletedPayload): NotificationTemplate {
  const { milestoneTitle, projectTitle, freelancerName } = payload.data;
  return {
    subject: 'אבן דרך הושלמה',
    body: `${freelancerName} סיים/ה את אבן הדרך "${milestoneTitle}" בפרויקט "${projectTitle}"`,
    link: `${APP_URL}/marketplace/${payload.data.projectId}`,
  };
}

function courseEnrolledTemplate(payload: CourseEnrolledPayload): NotificationTemplate {
  const { courseTitle, instructorName } = payload.data;
  return {
    subject: 'נרשמת לקורס בהצלחה',
    body: `נרשמת לקורס "${courseTitle}" של ${instructorName}. בהצלחה בלימודים!`,
    link: `${APP_URL}/courses/${payload.data.courseId}`,
  };
}

function moderationResultTemplate(payload: ModerationResultPayload): NotificationTemplate {
  const { entityType, result, entityTitle, reason } = payload.data;

  const entityLabel = getEntityLabel(entityType);
  const titleSuffix = entityTitle ? ` "${entityTitle}"` : '';

  let body: string;
  switch (result) {
    case 'APPROVED':
      body = `התוכן שלך (${entityLabel}${titleSuffix}) אושר ופורסם בהצלחה`;
      break;
    case 'REJECTED':
      body = `התוכן שלך (${entityLabel}${titleSuffix}) נדחה${reason ? `: ${reason}` : ''}`;
      break;
    case 'FLAGGED':
      body = `התוכן שלך (${entityLabel}${titleSuffix}) סומן לבדיקה נוספת${reason ? `: ${reason}` : ''}`;
      break;
  }

  return {
    subject: 'עדכון בדיקת תוכן',
    body,
    link: `${APP_URL}/settings/notifications`,
  };
}

function weeklyDigestTemplate(payload: WeeklyDigestPayload): NotificationTemplate {
  const {
    newThreadsCount,
    newProjectsCount,
    newArticlesCount,
    unreadNotificationsCount,
  } = payload.data;

  const parts: string[] = [];
  if (newThreadsCount > 0) parts.push(`${newThreadsCount} דיונים חדשים`);
  if (newProjectsCount > 0) parts.push(`${newProjectsCount} פרויקטים חדשים`);
  if (newArticlesCount > 0) parts.push(`${newArticlesCount} מאמרים חדשים`);
  if (unreadNotificationsCount > 0) parts.push(`${unreadNotificationsCount} התראות שלא נקראו`);

  const body = parts.length > 0
    ? `השבוע בקהילה: ${parts.join(', ')}`
    : 'השבוע בקהילה: בדוק/י מה חדש!';

  return {
    subject: 'סיכום שבועי — קהילת אנשי מקצוע',
    body,
    link: `${APP_URL}/`,
  };
}

function welcomeTemplate(payload: WelcomePayload): NotificationTemplate {
  const { displayName } = payload.data;
  return {
    subject: 'ברוכים הבאים לקהילת אנשי מקצוע!',
    body: `שלום ${displayName}, ברוך/ה הבא/ה לקהילת אנשי מקצוע! כאן תוכל/י למצוא פרויקטים, דיונים מקצועיים, קורסים ועוד.`,
    link: `${APP_URL}/`,
  };
}

// ─── Template Dispatcher ────────────────────────────

export function getTemplate(payload: NotificationPayload): NotificationTemplate {
  switch (payload.type) {
    case 'new_reply':
      return newReplyTemplate(payload);
    case 'new_proposal':
      return newProposalTemplate(payload);
    case 'payment_received':
      return paymentReceivedTemplate(payload);
    case 'payment_released':
      return paymentReleasedTemplate(payload);
    case 'milestone_completed':
      return milestoneCompletedTemplate(payload);
    case 'course_enrolled':
      return courseEnrolledTemplate(payload);
    case 'moderation_result':
      return moderationResultTemplate(payload);
    case 'weekly_digest':
      return weeklyDigestTemplate(payload);
    case 'welcome':
      return welcomeTemplate(payload);
  }
}

// ─── Helpers ────────────────────────────────────────

/**
 * Maps entity type identifiers to Hebrew labels for display.
 */
function getEntityLabel(entityType: string): string {
  const labels: Record<string, string> = {
    thread: 'דיון',
    post: 'תגובה',
    article: 'מאמר',
    listing: 'מודעה',
    portfolio_project: 'פרויקט תיק עבודות',
    portfolio_comment: 'תגובה לתיק עבודות',
    article_comment: 'תגובה למאמר',
    course: 'קורס',
    project: 'פרויקט',
    message: 'הודעה',
  };
  return labels[entityType] ?? 'תוכן';
}

// ─── WhatsApp Template Mapping ──────────────────────

/**
 * Maps notification event types to WhatsApp template names
 * registered in Meta Business Manager, and extracts
 * template parameters from the payload.
 */
export function getWhatsAppTemplate(
  payload: NotificationPayload,
): { templateName: string; parameters: string[] } | null {
  switch (payload.type) {
    case 'new_reply':
      return {
        templateName: 'new_message_notification',
        parameters: [payload.data.authorName, payload.data.threadTitle],
      };
    case 'new_proposal':
      return {
        templateName: 'proposal_received',
        parameters: [payload.data.projectTitle, payload.data.freelancerName],
      };
    case 'payment_received':
      return {
        templateName: 'milestone_funded',
        parameters: [payload.data.projectTitle, formatILS(payload.data.amount)],
      };
    case 'payment_released':
      return {
        templateName: 'milestone_released',
        parameters: [payload.data.milestoneTitle, formatILS(payload.data.amount)],
      };
    case 'milestone_completed':
      return {
        templateName: 'milestone_funded',
        parameters: [payload.data.milestoneTitle, payload.data.freelancerName],
      };
    case 'course_enrolled':
      return {
        templateName: 'course_enrolled',
        parameters: [payload.data.courseTitle, payload.data.instructorName],
      };
    case 'weekly_digest':
      return {
        templateName: 'weekly_digest',
        parameters: [
          String(payload.data.newThreadsCount),
          String(payload.data.newProjectsCount),
        ],
      };
    case 'welcome':
      return {
        templateName: 'welcome_message',
        parameters: [payload.data.displayName],
      };
    case 'moderation_result':
      // Moderation results are not sent via WhatsApp
      return null;
  }
}

import * as React from 'react';
import { Resend } from 'resend';
import type {
  WelcomeEmailProps,
  VerificationEmailProps,
  NotificationEmailProps,
  PasswordResetEmailProps,
} from './types';
import WelcomeEmail from './templates/welcome';
import VerificationEmail from './templates/verification';
import NotificationEmail from './templates/notification';
import PasswordResetEmail from './templates/password-reset';

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: React.ReactElement;
}

export async function sendEmail({ to, subject, react }: SendEmailOptions) {
  const { data, error } = await resend.emails.send({
    from: 'קהילת אנשי מקצוע <noreply@platform.co.il>',
    to: Array.isArray(to) ? to : [to],
    subject,
    react,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}

export async function sendWelcomeEmail(to: string, props: WelcomeEmailProps) {
  return sendEmail({
    to,
    subject: 'ברוכים הבאים לקהילת אנשי מקצוע!',
    react: React.createElement(WelcomeEmail, props),
  });
}

export async function sendVerificationEmail(
  to: string,
  props: VerificationEmailProps
) {
  return sendEmail({
    to,
    subject: `קוד האימות שלך: ${props.code}`,
    react: React.createElement(VerificationEmail, props),
  });
}

export async function sendNotificationEmail(
  to: string,
  props: NotificationEmailProps
) {
  return sendEmail({
    to,
    subject: props.notificationTitle,
    react: React.createElement(NotificationEmail, props),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  props: PasswordResetEmailProps
) {
  return sendEmail({
    to,
    subject: 'איפוס סיסמה - קהילת אנשי מקצוע',
    react: React.createElement(PasswordResetEmail, props),
  });
}

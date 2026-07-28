export interface EmailTemplate {
  subject: string;
  previewText?: string;
}

export interface WelcomeEmailProps {
  displayName: string;
  verificationUrl: string;
}

export interface VerificationEmailProps {
  code: string;
  expiresInMinutes: number;
}

export interface NotificationEmailProps {
  displayName: string;
  notificationTitle: string;
  notificationBody: string;
  actionUrl: string;
}

export interface PasswordResetEmailProps {
  resetUrl: string;
  displayName: string;
}

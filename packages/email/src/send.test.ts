import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSend } = vi.hoisted(() => {
  return { mockSend: vi.fn() };
});

vi.mock('resend', () => {
  return {
    Resend: class MockResend {
      emails = { send: mockSend };
    },
  };
});

vi.mock('./templates/welcome', () => ({
  default: () => null,
}));
vi.mock('./templates/verification', () => ({
  default: () => null,
}));
vi.mock('./templates/notification', () => ({
  default: () => null,
}));
vi.mock('./templates/password-reset', () => ({
  default: () => null,
}));

import { sendEmail, sendWelcomeEmail, sendVerificationEmail, sendNotificationEmail, sendPasswordResetEmail } from './send';

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({
      data: { id: 'email-1' },
      error: null,
    });
  });

  describe('sendEmail', () => {
    it('sends email with correct from address', async () => {
      await sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        react: null as unknown as React.ReactElement,
      });

      expect(mockSend).toHaveBeenCalledWith({
        from: 'קהילת אנשי מקצוע <noreply@platform.co.il>',
        to: ['test@example.com'],
        subject: 'Test Subject',
        react: null,
      });
    });

    it('converts single recipient to array', async () => {
      await sendEmail({
        to: 'single@example.com',
        subject: 'Test',
        react: null as unknown as React.ReactElement,
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: ['single@example.com'] })
      );
    });

    it('passes array recipients as-is', async () => {
      await sendEmail({
        to: ['a@example.com', 'b@example.com'],
        subject: 'Test',
        react: null as unknown as React.ReactElement,
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: ['a@example.com', 'b@example.com'] })
      );
    });

    it('throws on send failure', async () => {
      mockSend.mockResolvedValueOnce({
        data: null,
        error: { message: 'Rate limit exceeded' },
      });

      await expect(
        sendEmail({
          to: 'test@example.com',
          subject: 'Test',
          react: null as unknown as React.ReactElement,
        })
      ).rejects.toThrow('Failed to send email: Rate limit exceeded');
    });
  });

  describe('sendWelcomeEmail', () => {
    it('sends with correct subject in Hebrew', async () => {
      await sendWelcomeEmail('user@example.com', { displayName: 'יוסי', verificationUrl: 'https://app.com/verify?token=abc' });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'ברוכים הבאים לקהילת אנשי מקצוע!',
          to: ['user@example.com'],
        })
      );
    });
  });

  describe('sendVerificationEmail', () => {
    it('includes code in subject', async () => {
      await sendVerificationEmail('user@example.com', { code: '123456', expiresInMinutes: 10 });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'קוד האימות שלך: 123456',
        })
      );
    });
  });

  describe('sendNotificationEmail', () => {
    it('uses notification title as subject', async () => {
      await sendNotificationEmail('user@example.com', {
        displayName: 'יוסי',
        notificationTitle: 'הודעה חדשה',
        notificationBody: 'קיבלת תגובה חדשה',
        actionUrl: 'https://app.com/thread/1',
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'הודעה חדשה',
        })
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sends with password reset subject', async () => {
      await sendPasswordResetEmail('user@example.com', { resetUrl: 'https://app.com/reset?token=abc', displayName: 'יוסי' });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'איפוס סיסמה - קהילת אנשי מקצוע',
        })
      );
    });
  });
});

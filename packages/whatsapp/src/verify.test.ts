import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({
  sendWhatsAppTemplate: vi.fn().mockResolvedValue({ messages: [{ id: 'msg-1' }] }),
}));

import { sendOTP, verifyWebhookToken } from './verify';
import { sendWhatsAppTemplate } from './client';

describe('WhatsApp Verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHATSAPP_VERIFY_TOKEN = 'my-secret-token';
  });

  describe('sendOTP', () => {
    it('sends OTP via WhatsApp template', async () => {
      await sendOTP('972501234567', '123456');

      expect(sendWhatsAppTemplate).toHaveBeenCalledWith(
        '972501234567',
        'otp_verification',
        ['123456'],
      );
    });
  });

  describe('verifyWebhookToken', () => {
    it('returns true for correct token', () => {
      expect(verifyWebhookToken('my-secret-token')).toBe(true);
    });

    it('returns false for incorrect token', () => {
      expect(verifyWebhookToken('wrong-token')).toBe(false);
    });
  });
});

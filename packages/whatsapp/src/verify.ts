import { sendWhatsAppTemplate } from './client';

export async function sendOTP(phoneNumber: string, code: string) {
  return sendWhatsAppTemplate(phoneNumber, 'otp_verification', [code]);
}

export function verifyWebhookToken(token: string): boolean {
  return token === process.env.WHATSAPP_VERIFY_TOKEN;
}

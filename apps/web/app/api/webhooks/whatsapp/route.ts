import { NextRequest, NextResponse } from 'next/server';

import { verifyWebhook, processWebhook } from '@platform/whatsapp';
import { prisma } from '@platform/db';

// GET: Webhook verification (Meta sends this to verify the endpoint)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (!mode || !token || !challenge) {
      return NextResponse.json(
        { error: 'Missing required verification parameters' },
        { status: 400 }
      );
    }

    if (!process.env.WHATSAPP_VERIFY_TOKEN) {
      console.error('[webhooks/whatsapp] WHATSAPP_VERIFY_TOKEN is not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const result = verifyWebhook(mode, token, challenge);

    if (result) {
      return new NextResponse(result, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }

    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 403 }
    );
  } catch (error) {
    console.error('[webhooks/whatsapp] Verification error:', error);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 403 }
    );
  }
}

// POST: Receive messages and status updates from Meta
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      console.error('[webhooks/whatsapp] Failed to parse request body');
      // Always return 200 to Meta to prevent retries for malformed payloads
      return NextResponse.json({ success: true });
    }

    await processWebhook(body, {
      onMessage: async (message, senderPhone, senderName) => {
        console.log(`[webhooks/whatsapp] Message from ${senderName} (${senderPhone}):`, message);

        // Route to appropriate handler based on message content
        if (message.type === 'text' && message.text?.body) {
          const text = message.text.body.trim();

          // Check if this is an OTP verification response (4-6 digit code)
          if (/^\d{4,6}$/.test(text)) {
            // Look up user by phone number, then find pending verification
            const user = await prisma.user.findFirst({
              where: { phone: senderPhone },
            });

            if (user) {
              const verification = await prisma.userVerification.findFirst({
                where: {
                  userId: user.id,
                  type: 'PHONE',
                  code: text,
                  verified: false,
                  expiresAt: { gt: new Date() },
                },
                orderBy: { expiresAt: 'desc' },
              });

              if (verification) {
                await prisma.userVerification.update({
                  where: { id: verification.id },
                  data: { verified: true },
                });
                console.log(`[webhooks/whatsapp] OTP verified for ${senderPhone}`);
              }
            }
          }
        }
      },
      onStatusUpdate: async (status) => {
        console.log(`[webhooks/whatsapp] Status update: ${status.id} -> ${status.status}`);

        // Update notification WhatsApp delivery timestamp
        // For delivered/read messages, update the whatsappSentAt tracking field
        if (status.status === 'read') {
          // Find notifications for this recipient that were sent via WhatsApp
          // and mark them as read
          const user = await prisma.user.findFirst({
            where: { phone: status.recipient_id },
          });

          if (user) {
            await prisma.notification.updateMany({
              where: {
                userId: user.id,
                channels: { has: 'WHATSAPP' },
                whatsappSentAt: { not: null },
                readAt: null,
              },
              data: { readAt: new Date() },
            });
          }
        }
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[webhooks/whatsapp] Webhook processing error:', error);
    // Always return 200 to Meta to prevent infinite retries
    // Meta will retry on non-2xx responses, which can cause duplicate processing
    return NextResponse.json({ success: true });
  }
}

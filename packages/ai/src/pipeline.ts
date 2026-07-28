import { type PrismaClient } from '@platform/db';

import { moderateText, type ModerationResult } from './moderation';
import { sanitizeText, type SanitizeResult } from './sanitize';

export interface ContentModerationInput {
  text: string;
  entityType: string;
  entityId: string;
  authorId: string;
}

export interface ContentModerationOutput {
  sanitized: SanitizeResult;
  aiResult: ModerationResult;
  finalStatus: 'APPROVED' | 'PENDING' | 'FLAGGED' | 'REJECTED';
}

/**
 * 3-stage content moderation pipeline:
 * 1. Sanitize (strip HTML, normalize whitespace)
 * 2. AI moderation (OpenAI text moderation API)
 * 3. Set status: auto-approve clean content, flag suspicious content for human review
 */
export async function runContentModeration(
  input: ContentModerationInput,
  prisma: PrismaClient,
): Promise<ContentModerationOutput> {
  // Stage 1: Sanitize
  const sanitized = sanitizeText(input.text);

  // Stage 2: AI moderation
  let aiResult: ModerationResult;
  try {
    aiResult = await moderateText(sanitized.text);
  } catch {
    // If AI moderation fails, send to human review
    aiResult = {
      isApproved: false,
      confidence: 0,
      flaggedCategories: ['ai_error'],
      reason: 'AI moderation unavailable',
    };
  }

  // Stage 3: Determine final status
  let finalStatus: ContentModerationOutput['finalStatus'];

  if (aiResult.isApproved && sanitized.warnings.length === 0) {
    // Clean content → auto-approve
    finalStatus = 'APPROVED';
  } else if (!aiResult.isApproved && aiResult.confidence > 0.9) {
    // High confidence rejection → auto-reject
    finalStatus = 'REJECTED';
  } else {
    // Uncertain → flag for human review
    finalStatus = 'FLAGGED';
  }

  // Log the moderation action
  try {
    await prisma.moderationLog.create({
      data: {
        moderatorId: null,
        entityType: input.entityType,
        entityId: input.entityId,
        action: finalStatus === 'APPROVED' ? 'APPROVE' : finalStatus === 'REJECTED' ? 'REJECT' : 'FLAG',
        reason: aiResult.reason ?? (sanitized.warnings.length > 0 ? `Warnings: ${sanitized.warnings.join(', ')}` : null),
        newStatus: finalStatus,
        isAutomatic: true,
      },
    });
  } catch {
    // Log failure shouldn't block the operation
  }

  return { sanitized, aiResult, finalStatus };
}

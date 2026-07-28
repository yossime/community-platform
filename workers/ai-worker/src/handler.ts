import type { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

import {
  sqsMessagePayloadSchema,
  imageModerationResponseSchema,
  type SQSMessagePayload,
  type ModerateTextPayload,
  type ModerateImagePayload,
  type GenerateEmbeddingPayload,
  type SummarizeThreadPayload,
  type ModerationResult,
} from './types';

// ─── Singleton Clients ───────────────────────────────

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ─── Lambda Handler ──────────────────────────────────

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  const results = await Promise.allSettled(
    event.Records.map(async (record) => {
      const messageId = record.messageId;

      try {
        const rawBody: unknown = JSON.parse(record.body);
        const payload = sqsMessagePayloadSchema.parse(rawBody);

        await processMessage(payload);
      } catch (error) {
        console.error(`[ai-worker] Failed to process message ${messageId}:`, error);
        batchItemFailures.push({ itemIdentifier: messageId });
      }
    }),
  );

  // Log overall batch results
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = batchItemFailures.length;
  console.log(`[ai-worker] Batch complete: ${succeeded} succeeded, ${failed} failed out of ${event.Records.length} records`);

  return { batchItemFailures };
}

// ─── Message Dispatcher ──────────────────────────────

async function processMessage(payload: SQSMessagePayload): Promise<void> {
  switch (payload.type) {
    case 'moderate_text':
      return handleModerateText(payload);
    case 'moderate_image':
      return handleModerateImage(payload);
    case 'generate_embedding':
      return handleGenerateEmbedding(payload);
    case 'summarize_thread':
      return handleSummarizeThread(payload);
  }
}

// ─── Text Moderation ─────────────────────────────────

async function handleModerateText(payload: ModerateTextPayload): Promise<void> {
  const { entityType, entityId, content } = payload;

  console.log(`[ai-worker] Moderating text for ${entityType}:${entityId}`);

  const result = await moderateText(content);
  const newStatus = result.isApproved ? 'APPROVED' : 'FLAGGED';

  await updateModerationStatus(entityType, entityId, newStatus, result);

  console.log(`[ai-worker] Text moderation result for ${entityType}:${entityId}: ${newStatus} (confidence: ${result.confidence.toFixed(3)})`);
}

async function moderateText(text: string): Promise<ModerationResult> {
  const response = await openai.moderations.create({
    model: 'text-moderation-latest',
    input: text,
  });

  const result = response.results[0];
  if (!result) {
    // If API returns no results, default to approved with low confidence
    return { isApproved: true, confidence: 0.5, flaggedCategories: [] };
  }

  const flaggedCategories = Object.entries(result.categories)
    .filter(([, flagged]) => flagged)
    .map(([category]) => category);

  const maxScore = Math.max(...Object.values(result.category_scores));

  return {
    isApproved: !result.flagged,
    confidence: 1 - maxScore,
    flaggedCategories,
    reason:
      flaggedCategories.length > 0
        ? `Flagged categories: ${flaggedCategories.join(', ')}`
        : undefined,
  };
}

// ─── Image Moderation (Modesty Compliance) ───────────

async function handleModerateImage(payload: ModerateImagePayload): Promise<void> {
  const { entityType, entityId, imageUrl } = payload;

  console.log(`[ai-worker] Moderating image for ${entityType}:${entityId}`);

  const result = await moderateImage(imageUrl);
  const newStatus = result.isApproved ? 'APPROVED' : 'FLAGGED';

  await updateModerationStatus(entityType, entityId, newStatus, result);

  console.log(`[ai-worker] Image moderation result for ${entityType}:${entityId}: ${newStatus}`);
}

async function moderateImage(imageUrl: string): Promise<ModerationResult> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: [
          'You are a content moderation system for a Haredi (ultra-Orthodox Jewish) professional community platform.',
          'Analyze the provided image and check for the following violations:',
          '1. Images of women or girls — ANY image containing a recognizable woman or girl must be rejected.',
          '2. Immodest clothing or content — exposed skin beyond face and hands for any person.',
          '3. Violent, graphic, or disturbing content.',
          '4. Inappropriate symbols, offensive language in the image, or hate speech.',
          '5. Sexually suggestive content of any kind.',
          '',
          'Respond ONLY with valid JSON: {"approved": boolean, "reason": string | null}',
          'If the image is approved, set reason to null.',
          'If rejected, provide a brief explanation of the violation in English.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url' as const,
            image_url: { url: imageUrl, detail: 'low' as const },
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 200,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    // If we cannot parse the response, reject for safety
    return {
      isApproved: false,
      confidence: 0,
      flaggedCategories: ['parse_error'],
      reason: 'Failed to parse moderation response from AI',
    };
  }

  try {
    const parsed = imageModerationResponseSchema.parse(JSON.parse(content));
    return {
      isApproved: parsed.approved,
      confidence: 1,
      flaggedCategories: parsed.approved ? [] : ['modesty_violation'],
      reason: parsed.reason ?? undefined,
    };
  } catch {
    return {
      isApproved: false,
      confidence: 0,
      flaggedCategories: ['parse_error'],
      reason: 'Invalid JSON response from moderation AI',
    };
  }
}

// ─── Embedding Generation ────────────────────────────

async function handleGenerateEmbedding(payload: GenerateEmbeddingPayload): Promise<void> {
  const { entityType, entityId, content } = payload;

  console.log(`[ai-worker] Generating embedding for ${entityType}:${entityId}`);

  const embedding = await generateEmbedding(content);

  // Upsert into SearchEmbedding table using raw SQL for pgvector support
  const embeddingStr = `[${embedding.join(',')}]`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO search_embeddings ("id", "entityType", "entityId", "embedding", "content", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3::vector(1536), $4, NOW(), NOW())
     ON CONFLICT ("entityType", "entityId")
     DO UPDATE SET "embedding" = $3::vector(1536), "content" = $4, "updatedAt" = NOW()`,
    entityType,
    entityId,
    embeddingStr,
    content,
  );

  console.log(`[ai-worker] Embedding stored for ${entityType}:${entityId} (${embedding.length} dimensions)`);
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error('OpenAI returned empty embedding response');
  }

  return embedding;
}

// ─── Thread Summarization ────────────────────────────

async function handleSummarizeThread(payload: SummarizeThreadPayload): Promise<void> {
  const { entityId, content } = payload;

  console.log(`[ai-worker] Summarizing thread ${entityId}`);

  const summary = await summarizeThread(content);

  // Store the summary as a moderation log entry with action "summarize"
  // This makes the summary accessible and audit-trailed
  await prisma.moderationLog.create({
    data: {
      entityType: 'thread',
      entityId,
      action: 'summarize',
      reason: summary,
      isAutomatic: true,
      newStatus: 'APPROVED',
    },
  });

  console.log(`[ai-worker] Thread ${entityId} summarized (${summary.length} chars)`);
}

async function summarizeThread(content: string): Promise<string> {
  // Truncate very long threads to stay within token limits
  const maxInputLength = 12000;
  const truncatedContent =
    content.length > maxInputLength
      ? content.slice(0, maxInputLength) + '\n\n[...truncated]'
      : content;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: [
          'You are a summarization assistant for a Hebrew-language professional community forum.',
          'Summarize the following forum thread in Hebrew.',
          'Include the main topic, key points discussed, and any conclusions or decisions reached.',
          'Keep the summary concise — 2 to 4 sentences maximum.',
          'Use professional, neutral language appropriate for a Haredi community.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: truncatedContent,
      },
    ],
    max_tokens: 500,
    temperature: 0.3,
  });

  const summary = response.choices[0]?.message?.content;
  if (!summary) {
    throw new Error('OpenAI returned empty summarization response');
  }

  return summary.trim();
}

// ─── Database Helpers ────────────────────────────────

/**
 * Maps entityType to the database table name for raw SQL queries.
 * This avoids dynamic Prisma model access and keeps things type-safe.
 */
const ENTITY_TABLE_MAP: Record<string, string> = {
  thread: 'threads',
  post: 'posts',
  article: 'articles',
  listing: 'classified_listings',
  portfolio_comment: 'portfolio_comments',
  article_comment: 'article_comments',
  course: 'courses',
  project: 'projects',
} as const;

/**
 * Updates the moderationStatus of an entity and creates a ModerationLog entry.
 * Uses raw SQL for the dynamic entity update to avoid unsafe type casting,
 * and Prisma's typed API for the ModerationLog insert.
 */
async function updateModerationStatus(
  entityType: string,
  entityId: string,
  newStatus: 'APPROVED' | 'FLAGGED',
  result: ModerationResult,
): Promise<void> {
  const tableName = ENTITY_TABLE_MAP[entityType];

  if (!tableName) {
    console.warn(`[ai-worker] No moderable table mapping for entityType: ${entityType}`);
    // Still log the moderation attempt even if we cannot update the entity
    await prisma.moderationLog.create({
      data: {
        entityType,
        entityId,
        action: newStatus === 'APPROVED' ? 'auto_approve' : 'auto_flag',
        reason: result.reason ?? null,
        aiConfidence: result.confidence,
        isAutomatic: true,
        newStatus,
      },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Fetch current status for the audit log
    const rows = await tx.$queryRawUnsafe<Array<{ moderationStatus: string }>>(
      `SELECT "moderationStatus" FROM "${tableName}" WHERE "id" = $1 LIMIT 1`,
      entityId,
    );
    const previousStatus = rows[0]?.moderationStatus;

    // Update the entity's moderation status
    await tx.$executeRawUnsafe(
      `UPDATE "${tableName}" SET "moderationStatus" = $1::"ModerationStatus", "updatedAt" = NOW() WHERE "id" = $2`,
      newStatus,
      entityId,
    );

    // Create audit log
    await tx.moderationLog.create({
      data: {
        entityType,
        entityId,
        action: newStatus === 'APPROVED' ? 'auto_approve' : 'auto_flag',
        reason: result.reason ?? null,
        aiConfidence: result.confidence,
        isAutomatic: true,
        previousStatus: previousStatus as 'PENDING' | 'APPROVED' | 'REJECTED' | 'FLAGGED' | 'REMOVED' | undefined,
        newStatus,
      },
    });
  });
}

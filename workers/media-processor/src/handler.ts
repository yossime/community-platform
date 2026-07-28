import type { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda';
import { PrismaClient } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { encode } from 'blurhash';
import OpenAI from 'openai';

import {
  mediaProcessingPayloadSchema,
  modestyCheckResponseSchema,
  VARIANT_WIDTHS,
  ENTITY_STORAGE_PATHS,
  type MediaProcessingPayload,
  type MediaEntityType,
  type ImageVariant,
  type ProcessingResult,
} from './types';

// ─── Singleton Clients ───────────────────────────────

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ─── Constants ───────────────────────────────────────

const PUBLIC_BUCKET = 'public-media';
const WEBP_QUALITY = 80;
const BLURHASH_COMPONENT_X = 4;
const BLURHASH_COMPONENT_Y = 3;
const BLURHASH_SIZE = 200;

// ─── Lambda Handler ──────────────────────────────────

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  const results = await Promise.allSettled(
    event.Records.map(async (record) => {
      const messageId = record.messageId;

      try {
        const rawBody: unknown = JSON.parse(record.body);
        const payload = mediaProcessingPayloadSchema.parse(rawBody);

        await processImage(payload);
      } catch (error) {
        console.error(`[media-processor] Failed to process message ${messageId}:`, error);
        batchItemFailures.push({ itemIdentifier: messageId });
      }
    }),
  );

  // Log overall batch results
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = batchItemFailures.length;
  console.log(
    `[media-processor] Batch complete: ${succeeded} succeeded, ${failed} failed out of ${event.Records.length} records`,
  );

  return { batchItemFailures };
}

// ─── Main Processing Pipeline ────────────────────────

async function processImage(payload: MediaProcessingPayload): Promise<void> {
  const { entityType, entityId, bucket, path, userId } = payload;

  console.log(`[media-processor] Processing ${entityType}:${entityId} from ${bucket}/${path}`);

  // Step 1: Download from temp bucket
  const imageBuffer = await downloadFromStorage(bucket, path);

  // Step 2: Strip EXIF, auto-orient, and extract metadata
  const { buffer: orientedBuffer, metadata } = await prepareImage(imageBuffer);
  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error(`Invalid image dimensions: ${originalWidth}x${originalHeight}`);
  }

  console.log(
    `[media-processor] Image metadata: ${originalWidth}x${originalHeight}, format: ${metadata.format ?? 'unknown'}`,
  );

  // Step 3: Generate variants (only sizes <= original width)
  const applicableWidths = VARIANT_WIDTHS.filter((w) => w <= originalWidth);
  // Always include original width if it's smaller than the smallest standard width
  if (applicableWidths.length === 0) {
    applicableWidths.push(originalWidth as typeof VARIANT_WIDTHS[number]);
  }

  const variants = await generateVariants(orientedBuffer, applicableWidths, entityType, entityId);

  // Step 4: Generate BlurHash from the smallest variant
  const blurhash = await generateBlurhash(orientedBuffer);

  // Step 5: Upload all variants to public bucket
  const uploadedVariants = await uploadVariants(variants, entityType, entityId, userId);

  // Step 6: Modesty check via GPT-4o Vision
  // Use the 600px variant for moderation (good balance of detail vs. cost)
  // Fall back to the first available variant
  const moderationVariant =
    uploadedVariants.find((v) => v.width === 600) ?? uploadedVariants[0];
  if (!moderationVariant) {
    throw new Error('No variants generated for modesty check');
  }

  const moderationResult = await performModestyCheck(moderationVariant.url);

  // Step 7: Update the database record
  const result: ProcessingResult = {
    entityType,
    entityId,
    variants: uploadedVariants,
    blurhash,
    originalWidth,
    originalHeight,
    moderationStatus: moderationResult.approved ? 'APPROVED' : 'FLAGGED',
    moderationReason: moderationResult.reason,
  };

  await updateDatabaseRecord(result, userId);

  // Step 8: Delete from temp bucket
  await deleteFromStorage(bucket, path);

  console.log(
    `[media-processor] Completed ${entityType}:${entityId} — ${uploadedVariants.length} variants, ` +
      `moderation: ${result.moderationStatus}, blurhash: ${blurhash.slice(0, 10)}...`,
  );
}

// ─── Storage Operations ──────────────────────────────

async function downloadFromStorage(bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (error) {
    throw new Error(`Failed to download from ${bucket}/${path}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Empty file downloaded from ${bucket}/${path}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function deleteFromStorage(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    // Log but don't fail the pipeline — the image has already been processed
    console.warn(`[media-processor] Failed to delete temp file ${bucket}/${path}: ${error.message}`);
  }
}

// ─── Image Processing with Sharp ─────────────────────

interface PreparedImage {
  buffer: Buffer;
  metadata: sharp.Metadata;
}

async function prepareImage(imageBuffer: Buffer): Promise<PreparedImage> {
  // Auto-orient based on EXIF, then strip all metadata
  const pipeline = sharp(imageBuffer).rotate(); // rotate() auto-orients based on EXIF

  const metadata = await pipeline.metadata();
  const buffer = await pipeline.toBuffer();

  return { buffer, metadata };
}

interface VariantData {
  width: number;
  height: number;
  buffer: Buffer;
  size: number;
}

async function generateVariants(
  imageBuffer: Buffer,
  widths: readonly number[],
  entityType: MediaEntityType,
  entityId: string,
): Promise<VariantData[]> {
  const variants: VariantData[] = [];

  for (const targetWidth of widths) {
    const resized = sharp(imageBuffer)
      .resize(targetWidth, undefined, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY });

    const buffer = await resized.toBuffer();
    const resizedMetadata = await sharp(buffer).metadata();

    variants.push({
      width: resizedMetadata.width ?? targetWidth,
      height: resizedMetadata.height ?? 0,
      buffer,
      size: buffer.length,
    });

    console.log(
      `[media-processor] Generated variant ${targetWidth}w for ${entityType}:${entityId}: ` +
        `${resizedMetadata.width}x${resizedMetadata.height}, ${(buffer.length / 1024).toFixed(1)}KB`,
    );
  }

  return variants;
}

async function generateBlurhash(imageBuffer: Buffer): Promise<string> {
  // Resize to small dimensions for BlurHash encoding
  const { data, info } = await sharp(imageBuffer)
    .resize(BLURHASH_SIZE, undefined, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return encode(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    BLURHASH_COMPONENT_X,
    BLURHASH_COMPONENT_Y,
  );
}

// ─── Upload Variants to Public Bucket ────────────────

async function uploadVariants(
  variants: VariantData[],
  entityType: MediaEntityType,
  entityId: string,
  userId: string,
): Promise<ImageVariant[]> {
  const storagePath = ENTITY_STORAGE_PATHS[entityType];
  const uploadedVariants: ImageVariant[] = [];

  for (const variant of variants) {
    const fileName = `${storagePath}/${userId}/${entityId}/${variant.width}w.webp`;

    const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(fileName, variant.buffer, {
      contentType: 'image/webp',
      upsert: true,
    });

    if (error) {
      throw new Error(`Failed to upload variant ${variant.width}w to ${fileName}: ${error.message}`);
    }

    // Get the public URL
    const { data: urlData } = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(fileName);

    uploadedVariants.push({
      width: variant.width,
      height: variant.height,
      url: urlData.publicUrl,
      size: variant.size,
    });
  }

  return uploadedVariants;
}

// ─── Modesty Check (GPT-4o Vision) ──────────────────

interface ModestyResult {
  approved: boolean;
  reason: string | null;
}

async function performModestyCheck(imageUrl: string): Promise<ModestyResult> {
  try {
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
      console.warn('[media-processor] Empty response from modesty check AI, rejecting for safety');
      return { approved: false, reason: 'Failed to parse moderation response from AI' };
    }

    const parsed = modestyCheckResponseSchema.parse(JSON.parse(content));
    return { approved: parsed.approved, reason: parsed.reason };
  } catch (error) {
    // On AI service failure, flag for manual review rather than auto-approving
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[media-processor] Modesty check failed: ${errorMessage}`);
    return { approved: false, reason: `Modesty check service error: ${errorMessage}` };
  }
}

// ─── Database Update ─────────────────────────────────

async function updateDatabaseRecord(result: ProcessingResult, userId: string): Promise<void> {
  const { entityType, entityId, variants, blurhash, originalWidth, originalHeight, moderationStatus, moderationReason } =
    result;

  // Build variant URLs map for storage: { "200w": url, "600w": url, ... }
  const variantUrls: Record<string, string> = {};
  for (const variant of variants) {
    variantUrls[`${variant.width}w`] = variant.url;
  }

  // The primary URL is the largest available variant
  const primaryVariant = variants[variants.length - 1];
  const primaryUrl = primaryVariant?.url ?? '';

  // The thumbnail URL is the smallest variant
  const thumbnailVariant = variants[0];
  const thumbnailUrl = thumbnailVariant?.url ?? '';

  await prisma.$transaction(async (tx) => {
    // Update entity-specific image fields
    await updateEntityImage(tx, entityType, entityId, {
      primaryUrl,
      thumbnailUrl,
      variantUrls,
      blurhash,
      originalWidth,
      originalHeight,
      moderationStatus,
    });

    // Create moderation log entry
    await tx.moderationLog.create({
      data: {
        entityType: entityType,
        entityId,
        action: moderationStatus === 'APPROVED' ? 'auto_approve' : 'auto_flag',
        reason: moderationReason,
        aiConfidence: 1,
        isAutomatic: true,
        previousStatus: 'PENDING',
        newStatus: moderationStatus,
      },
    });
  });

  console.log(
    `[media-processor] Database updated for ${entityType}:${entityId} — status: ${moderationStatus}`,
  );
}

interface ImageUpdateData {
  primaryUrl: string;
  thumbnailUrl: string;
  variantUrls: Record<string, string>;
  blurhash: string;
  originalWidth: number;
  originalHeight: number;
  moderationStatus: 'APPROVED' | 'FLAGGED';
}

/**
 * Updates the image-related columns on the appropriate entity table.
 * Each entity type stores image data differently, so we handle them case by case.
 */
async function updateEntityImage(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  entityType: MediaEntityType,
  entityId: string,
  data: ImageUpdateData,
): Promise<void> {
  switch (entityType) {
    case 'avatar': {
      // User model: update avatarUrl field
      await tx.$executeRawUnsafe(
        `UPDATE "users" SET "avatarUrl" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
        data.primaryUrl,
        entityId,
      );
      break;
    }

    case 'portfolio_media': {
      // PortfolioMedia model: update url, width, height, blurhash
      await tx.$executeRawUnsafe(
        `UPDATE "portfolio_media"
         SET "url" = $1, "width" = $2, "height" = $3, "blurhash" = $4
         WHERE "id" = $5`,
        data.primaryUrl,
        data.originalWidth,
        data.originalHeight,
        data.blurhash,
        entityId,
      );
      break;
    }

    case 'listing_image': {
      // ClassifiedListing model: append the processed image URL to the images array
      // and update moderation status
      await tx.$executeRawUnsafe(
        `UPDATE "classified_listings"
         SET "images" = array_append("images", $1),
             "moderationStatus" = $2::"ModerationStatus",
             "updatedAt" = NOW()
         WHERE "id" = $3`,
        data.primaryUrl,
        data.moderationStatus,
        entityId,
      );
      break;
    }

    case 'article_cover': {
      // Article model: update coverImageUrl and moderationStatus
      await tx.$executeRawUnsafe(
        `UPDATE "articles"
         SET "coverImageUrl" = $1, "moderationStatus" = $2::"ModerationStatus", "updatedAt" = NOW()
         WHERE "id" = $3`,
        data.primaryUrl,
        data.moderationStatus,
        entityId,
      );
      break;
    }

    case 'course_cover': {
      // Course model: update coverImageUrl and moderationStatus
      await tx.$executeRawUnsafe(
        `UPDATE "courses"
         SET "coverImageUrl" = $1, "moderationStatus" = $2::"ModerationStatus", "updatedAt" = NOW()
         WHERE "id" = $3`,
        data.primaryUrl,
        data.moderationStatus,
        entityId,
      );
      break;
    }

    case 'project_file': {
      // Project model: we store the processed file URL as a moderation log entry
      // since the Project model doesn't have dedicated image columns.
      // The moderationStatus is still updated.
      await tx.$executeRawUnsafe(
        `UPDATE "projects"
         SET "moderationStatus" = $1::"ModerationStatus", "updatedAt" = NOW()
         WHERE "id" = $2`,
        data.moderationStatus,
        entityId,
      );
      break;
    }
  }
}

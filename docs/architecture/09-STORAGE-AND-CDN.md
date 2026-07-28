# 09 — Storage & CDN

> File storage, image processing pipeline, CDN strategy, and Netfree compliance

---

## 1. Overview

All files are stored in **Supabase Storage** (S3-compatible), processed by the **media processor Lambda**, and served through the **platform's own domain** (no external CDN — Netfree compliance).

---

## 2. Storage Buckets

| Bucket | Access | Content | Max File Size |
|--------|--------|---------|---------------|
| `temp` | Private | Pending uploads awaiting moderation | 50 MB |
| `avatars` | Public | User profile pictures | 5 MB |
| `covers` | Public | User/forum cover images | 10 MB |
| `portfolio` | Public | Portfolio project media | 50 MB (Business) |
| `listings` | Public | Classified listing images | 10 MB |
| `articles` | Public | Article cover images and inline media | 10 MB |
| `courses` | Private (signed URLs) | Course videos and materials | 500 MB (video) |
| `messages` | Private | Message attachments | 20 MB |
| `ads` | Public | Advertisement banner images | 5 MB |
| `certificates` | Private (signed URLs) | Course completion certificates (PDF) | 2 MB |

### 2.1 Bucket Policies

```sql
-- Public buckets: read access for all, write via signed URL only
CREATE POLICY "public_read" ON storage.objects
  FOR SELECT USING (bucket_id IN ('avatars', 'covers', 'portfolio', 'listings', 'articles', 'ads'));

-- Temp bucket: user can upload, only service role can move/delete
CREATE POLICY "temp_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'temp'
    AND auth.role() = 'authenticated'
  );

-- Course bucket: only enrolled students can read
CREATE POLICY "course_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'courses'
    AND EXISTS (
      SELECT 1 FROM "Enrollment" e
      JOIN "User" u ON u.id = e."userId"
      WHERE u."supabaseAuthId" = auth.uid()::text
      AND e.status = 'ACTIVE'
    )
  );

-- Message attachments: only conversation participants
CREATE POLICY "message_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'messages'
    AND EXISTS (
      SELECT 1 FROM "ConversationParticipant" cp
      JOIN "User" u ON u.id = cp."userId"
      WHERE u."supabaseAuthId" = auth.uid()::text
    )
  );
```

---

## 3. Upload Flow

### 3.1 Signed URL Direct Upload

```
┌────────┐      ┌──────────┐      ┌─────────────────┐
│ Browser │─────▶│ tRPC API │─────▶│ Supabase Storage │
│         │  1   │ media.   │  2   │ /temp/{uuid}     │
│         │      │ getSign  │      │                   │
│         │      │ edUrl    │      │ Returns signed    │
│         │      └──────────┘      │ upload URL        │
│         │                        └───────┬───────────┘
│         │                                │
│         │  3. Direct upload via PUT       │
│         │────────────────────────────────▶│
│         │                                │
│         │  4. Confirm upload             │
│         │──────▶ tRPC media.confirmUpload │
│         │       │                         │
│         │       │  5. Publish to SNS      │
│         │       │     content-events      │
│         │       │     { IMAGE_UPLOADED }   │
└────────┘       └─────────────────────────┘
                          │
                 ┌────────▼────────┐
                 │ SQS fan-out     │
                 │                 │
            ┌────▼────┐    ┌──────▼──────┐
            │ ai-mod  │    │ media-proc  │
            │ queue   │    │ queue       │
            └────┬────┘    └──────┬──────┘
                 │                │
            ┌────▼────┐    ┌──────▼──────┐
            │ AI      │    │ Media       │
            │ Worker  │    │ Processor   │
            │         │    │             │
            │ Modesty │    │ • Resize    │
            │ check   │    │ • WebP      │
            │         │    │ • BlurHash  │
            └────┬────┘    │ • EXIF strip│
                 │         └──────┬──────┘
                 │                │
                 ▼                ▼
           ┌──────────────────────────┐
           │ If AI APPROVED:          │
           │ Move from /temp/ to      │
           │ target bucket with       │
           │ processed variants       │
           │                          │
           │ If AI REJECTED:          │
           │ Delete from /temp/       │
           │ Notify user              │
           └──────────────────────────┘
```

### 3.2 tRPC Media Router

```typescript
// packages/api/src/routers/media.ts

export const mediaRouter = router({
  getSignedUrl: protectedProcedure
    .input(z.object({
      bucket: z.enum(["temp"]),
      fileType: z.string().regex(/^(image\/(jpeg|png|gif|webp)|video\/mp4|application\/pdf)$/),
      fileSize: z.number().max(50 * 1024 * 1024), // 50MB max
    }))
    .mutation(async ({ ctx, input }) => {
      const fileExtension = input.fileType.split("/")[1];
      const path = `${ctx.user.id}/${crypto.randomUUID()}.${fileExtension}`;

      const { data, error } = await supabase.storage
        .from(input.bucket)
        .createSignedUploadUrl(path);

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return {
        signedUrl: data.signedUrl,
        path: data.path,
        token: data.token,
      };
    }),

  confirmUpload: protectedProcedure
    .input(z.object({
      tempPath: z.string(),
      targetBucket: z.enum(["avatars", "covers", "portfolio", "listings",
                            "articles", "courses", "messages", "ads"]),
      entityType: z.string(),
      entityId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Publish event for async processing
      await sns.publish({
        TopicArn: process.env.SNS_CONTENT_EVENTS_TOPIC_ARN!,
        Message: JSON.stringify({
          type: "IMAGE_UPLOADED",
          entityType: input.entityType,
          entityId: input.entityId,
          tempPath: input.tempPath,
          targetBucket: input.targetBucket,
          userId: ctx.user.id,
        }),
      });

      return { status: "PROCESSING" };
    }),
});
```

---

## 4. Image Processing Pipeline

### 4.1 Media Processor Lambda

```typescript
// workers/media-processor/src/handler.ts
import sharp from "sharp";
import { encode as encodeBlurHash } from "blurhash";

interface ProcessingResult {
  variants: ImageVariant[];
  blurhash: string;
  width: number;
  height: number;
}

interface ImageVariant {
  width: number;
  url: string;
  format: "webp" | "jpeg";
  size: number;
}

const VARIANT_WIDTHS = [200, 600, 1200, 2400];

export async function processImage(
  tempPath: string,
  targetBucket: string,
  entityId: string,
): Promise<ProcessingResult> {
  // 1. Download from temp bucket
  const { data } = await supabase.storage.from("temp").download(tempPath);
  const buffer = Buffer.from(await data!.arrayBuffer());

  // 2. Get metadata
  const metadata = await sharp(buffer).metadata();
  const originalWidth = metadata.width!;
  const originalHeight = metadata.height!;

  // 3. Strip EXIF data
  const stripped = await sharp(buffer)
    .rotate() // Auto-rotate based on EXIF, then strip
    .toBuffer();

  // 4. Generate variants
  const variants: ImageVariant[] = [];

  for (const targetWidth of VARIANT_WIDTHS) {
    if (targetWidth > originalWidth) continue; // Skip larger than original

    // WebP variant
    const webpBuffer = await sharp(stripped)
      .resize(targetWidth, null, { withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const webpPath = `${entityId}/w${targetWidth}.webp`;
    await supabase.storage.from(targetBucket).upload(webpPath, webpBuffer, {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    });

    variants.push({
      width: targetWidth,
      url: `/${targetBucket}/${webpPath}`,
      format: "webp",
      size: webpBuffer.length,
    });

    // JPEG fallback for older browsers
    const jpegBuffer = await sharp(stripped)
      .resize(targetWidth, null, { withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();

    const jpegPath = `${entityId}/w${targetWidth}.jpg`;
    await supabase.storage.from(targetBucket).upload(jpegPath, jpegBuffer, {
      contentType: "image/jpeg",
      cacheControl: "public, max-age=31536000, immutable",
    });

    variants.push({
      width: targetWidth,
      url: `/${targetBucket}/${jpegPath}`,
      format: "jpeg",
      size: jpegBuffer.length,
    });
  }

  // 5. Generate BlurHash
  const thumbBuffer = await sharp(stripped)
    .resize(32, 32, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const blurhash = encodeBlurHash(
    new Uint8ClampedArray(thumbBuffer),
    32,
    Math.round(32 * (originalHeight / originalWidth)),
    4,
    3,
  );

  // 6. Delete temp file
  await supabase.storage.from("temp").remove([tempPath]);

  return {
    variants,
    blurhash,
    width: originalWidth,
    height: originalHeight,
  };
}
```

### 4.2 Watermarking (Optional)

```typescript
// workers/media-processor/src/watermark.ts

export async function addWatermark(
  imageBuffer: Buffer,
  text: string = "platform.co.il",
): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  const svgWatermark = `
    <svg width="${width}" height="${height}">
      <text
        x="${width - 20}"
        y="${height - 20}"
        text-anchor="end"
        font-family="sans-serif"
        font-size="${Math.max(12, width * 0.02)}"
        fill="rgba(255,255,255,0.3)"
      >${text}</text>
    </svg>
  `;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svgWatermark), gravity: "southeast" }])
    .toBuffer();
}
```

---

## 5. CDN Strategy (Netfree Compliant)

### 5.1 The Netfree Challenge

Netfree is a content-filtering proxy used by most Haredi internet users. It blocks external CDNs, third-party domains, and many analytics services. **All assets must be served from the platform's own domain.**

### 5.2 CDN Architecture

```
Browser request: platform.co.il/storage/portfolio/abc/w600.webp
        │
        ▼
┌─────────────────────────────────────────┐
│  Vercel Edge (fra1)                      │
│                                          │
│  Route: /storage/:bucket/:path           │
│  → Next.js API route                     │
│  → Proxy to Supabase Storage             │
│  → Cache-Control: public, max-age=       │
│    31536000, immutable                   │
│                                          │
│  Route: /_next/image?url=...             │
│  → Next.js Image Optimization            │
│  → Automatic WebP/AVIF                   │
│  → Cached at edge                        │
└─────────────────────────────────────────┘
```

### 5.3 Image Component

```typescript
// apps/web/components/shared/platform-image.tsx
import Image from "next/image";

interface PlatformImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  blurhash?: string;
  priority?: boolean;
  className?: string;
}

export function PlatformImage({
  src, alt, width, height, blurhash, priority, className,
}: PlatformImageProps) {
  // All images served through our domain (Netfree safe)
  const imageUrl = src.startsWith("http")
    ? src  // Already absolute
    : `${process.env.NEXT_PUBLIC_APP_URL}/storage${src}`;

  return (
    <Image
      src={imageUrl}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={className}
      placeholder={blurhash ? "blur" : undefined}
      blurDataURL={blurhash ? blurhashToDataURL(blurhash) : undefined}
      loader={({ src, width, quality }) =>
        `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality || 75}`
      }
    />
  );
}
```

### 5.4 Self-Hosted Fonts

```css
/* apps/web/app/globals.css */

@font-face {
  font-family: "Heebo";
  src: url("/fonts/heebo/Heebo-Variable.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap;
  unicode-range: U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F;
}

@font-face {
  font-family: "Rubik";
  src: url("/fonts/rubik/Rubik-Variable.woff2") format("woff2-variations");
  font-weight: 300 900;
  font-display: swap;
}

@font-face {
  font-family: "Noto Sans Hebrew";
  src: url("/fonts/noto-sans-hebrew/NotoSansHebrew-Variable.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap;
  unicode-range: U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F;
}
```

### 5.5 Netfree Compliance Checklist

| Rule | Implementation |
|------|---------------|
| No external CDN (Cloudflare, AWS CF, etc.) | All assets served via Vercel edge + platform domain |
| No Google Fonts | Self-hosted .woff2 files in `/public/fonts/` |
| No external analytics | PostHog self-hosted or Vercel Analytics (first-party) |
| No social media embeds | No Twitter/YouTube/Facebook embeds |
| No external images | All images proxied through platform domain |
| No Google reCAPTCHA | Custom rate limiting + phone OTP |
| No external chat widgets | Built-in messaging system |
| No third-party auth | No Google/Facebook OAuth |
| Single-domain routing | All resources from `platform.co.il` |
| No WebRTC to external servers | WebSocket via platform's own WS server |

---

## 6. Video Storage & Streaming (Courses)

### 6.1 Video Upload Flow

```
Instructor upload → Supabase Storage /courses/{courseId}/{lessonId}/original.mp4
        │
        ▼
  Media Processor Lambda (heavy variant)
        │
        ├── Transcode to HLS segments:
        │     /courses/{courseId}/{lessonId}/360p/
        │     /courses/{courseId}/{lessonId}/720p/
        │     /courses/{courseId}/{lessonId}/1080p/
        │     /courses/{courseId}/{lessonId}/master.m3u8
        │
        └── Generate thumbnail:
              /courses/{courseId}/{lessonId}/thumb.webp
```

### 6.2 HLS Streaming with Signed URLs

```typescript
// packages/api/src/routers/course.ts

course.getLessonContent = protectedProcedure
  .input(z.object({ lessonId: z.string() }))
  .query(async ({ ctx, input }) => {
    // Verify enrollment
    const enrollment = await ctx.db.enrollment.findFirst({
      where: {
        userId: ctx.user.id,
        course: { modules: { some: { lessons: { some: { id: input.lessonId } } } } },
        status: "ACTIVE",
      },
    });

    if (!enrollment) {
      // Check if lesson is free preview
      const lesson = await ctx.db.lesson.findUniqueOrThrow({
        where: { id: input.lessonId },
      });
      if (!lesson.isFree) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ENROLLMENT_REQUIRED" });
      }
    }

    // Generate signed URL (4-hour expiry)
    const { data } = await supabase.storage
      .from("courses")
      .createSignedUrl(
        `${input.lessonId}/master.m3u8`,
        4 * 60 * 60, // 4 hours
      );

    return {
      videoUrl: data!.signedUrl,
      // Also sign segment URLs (the HLS player will need them)
    };
  });
```

---

## 7. Storage Quotas

### 7.1 Per-Tier Limits

| Resource | Free | Professional | Business | Enterprise |
|----------|------|-------------|----------|-----------|
| Avatar | 2 MB | 5 MB | 5 MB | 10 MB |
| Portfolio items | 3 (5 MB each) | Unlimited (20 MB each) | Unlimited (50 MB each) | Unlimited (100 MB each) |
| Classified images | 5 per listing (5 MB each) | 10 per listing (10 MB each) | 20 per listing (10 MB each) | 20 per listing |
| Message attachments | 5 MB | 20 MB | 20 MB | 50 MB |
| Total storage | 100 MB | 5 GB | 20 GB | 100 GB |
| Course video (per lesson) | N/A | N/A | 500 MB | 2 GB |

### 7.2 Quota Enforcement

```typescript
// packages/api/src/routers/media.ts

async function checkStorageQuota(userId: string, fileSize: number) {
  const membership = await db.membership.findUniqueOrThrow({
    where: { userId },
    select: { maxStorageMb: true },
  });

  // Calculate current usage
  const usage = await db.$queryRaw<[{ total: bigint }]>`
    SELECT COALESCE(SUM(size), 0) AS total
    FROM storage.objects
    WHERE owner = ${userId}
  `;

  const currentUsageMb = Number(usage[0].total) / (1024 * 1024);
  const newUsageMb = currentUsageMb + fileSize / (1024 * 1024);

  if (newUsageMb > membership.maxStorageMb) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "STORAGE_QUOTA_EXCEEDED",
      cause: {
        currentUsageMb: Math.round(currentUsageMb),
        maxMb: membership.maxStorageMb,
        requestedMb: Math.round(fileSize / (1024 * 1024)),
      },
    });
  }
}
```

---

## 8. Cleanup & Maintenance

| Task | Schedule | Action |
|------|----------|--------|
| Temp bucket cleanup | Every 6 hours | Delete files older than 24h from `/temp/` |
| Orphaned files | Weekly | Find files not referenced by any DB record, move to quarantine |
| Old message attachments | Monthly | Archive message attachments older than 1 year |
| Storage usage report | Daily | Calculate per-user storage for quota enforcement |
| Backup | Daily | Supabase automatic backups (Point-in-Time Recovery) |

# 15 — Rendering & Performance

> SSR/SSG strategy, Core Web Vitals targets, SEO structured data, and performance optimization

---

## 1. Rendering Strategy per Page

| Page | Strategy | Cache / Revalidation | Rationale |
|------|----------|---------------------|-----------|
| **Homepage** | SSR | 60s ISR | Dynamic content (trending threads, stats) |
| **Forum category listing** | SSR | 30s ISR | Frequent new threads |
| **Forum thread listing** | SSR | 30s ISR | Frequent new threads |
| **Thread detail** | SSR | 60s ISR + on-demand revalidation | Needs live feel, revalidate on new post |
| **Article listing** | SSR | 5 min ISR | Less frequent updates |
| **Article detail** | SSG + ISR | 1h ISR, on-demand on edit | Mostly static content |
| **Portfolio showcase** | SSR | 5 min ISR | Mixed fresh + evergreen content |
| **Portfolio detail** | SSR | 5 min ISR | Owner may update frequently |
| **Course catalog** | SSR | 5 min ISR | Moderate update frequency |
| **Course landing page** | SSG + ISR | 1h ISR, on-demand on edit | Marketing page, mostly static |
| **Course player** | SSR | No cache | Personalized progress state |
| **Marketplace projects** | SSR | 60s ISR | Active bidding environment |
| **Marketplace project detail** | SSR | 60s ISR + on-demand | Proposals, status changes |
| **Freelancer profile** | SSR | 5 min ISR | Moderate updates |
| **Classifieds listing** | SSR | 60s ISR | Active marketplace |
| **Classified detail** | SSR | 5 min ISR | Moderate updates |
| **User profile** | SSR | 5 min ISR | Moderate updates |
| **Search results** | SSR | No cache | Dynamic, personalized |
| **Dashboard** | SSR | No cache | Fully personalized |
| **Messages** | SSR | No cache | Real-time, personalized |
| **Settings** | SSR | No cache | Personalized |
| **Admin dashboard** | SSR | No cache | Privileged, dynamic |

### 1.1 ISR Configuration

```typescript
// apps/web/app/(main)/forums/[categorySlug]/[forumSlug]/[threadSlug]/page.tsx

export const revalidate = 60; // Revalidate every 60 seconds

// On-demand revalidation (called when new post is created)
// apps/web/app/api/revalidate/route.ts
import { revalidatePath, revalidateTag } from "next/cache";

export async function POST(request: Request) {
  const { secret, path, tag } = await request.json();

  if (secret !== process.env.REVALIDATION_SECRET) {
    return Response.json({ error: "Invalid secret" }, { status: 401 });
  }

  if (path) revalidatePath(path);
  if (tag) revalidateTag(tag);

  return Response.json({ revalidated: true });
}
```

### 1.2 Static Generation (SSG)

Articles and course landing pages are pre-generated at build time with ISR:

```typescript
// apps/web/app/(main)/articles/[slug]/page.tsx

export async function generateStaticParams() {
  // Pre-generate top 100 articles at build time
  const articles = await db.article.findMany({
    where: { isPublished: true, moderationStatus: "APPROVED" },
    orderBy: { viewCount: "desc" },
    take: 100,
    select: { slug: true },
  });

  return articles.map((a) => ({ slug: a.slug }));
}

export const revalidate = 3600; // 1 hour ISR for remaining pages
```

---

## 2. Core Web Vitals Targets

| Metric | Target | Budget |
|--------|--------|--------|
| **LCP** (Largest Contentful Paint) | < 2.0s | < 2.5s (Good threshold) |
| **CLS** (Cumulative Layout Shift) | < 0.05 | < 0.1 (Good threshold) |
| **INP** (Interaction to Next Paint) | < 100ms | < 200ms (Good threshold) |
| **FCP** (First Contentful Paint) | < 1.5s | < 1.8s |
| **TTFB** (Time to First Byte) | < 500ms | < 800ms |
| **TBT** (Total Blocking Time) | < 150ms | < 200ms |

### 2.1 Lighthouse Targets

```jsonc
// .github/lighthouse-budget.json
[
  {
    "path": "/",
    "performance": 90,
    "accessibility": 95,
    "best-practices": 90,
    "seo": 95
  },
  {
    "path": "/forums",
    "performance": 90,
    "accessibility": 95,
    "best-practices": 90,
    "seo": 95
  }
]
```

---

## 3. Performance Optimization

### 3.1 JavaScript Bundle Optimization

```typescript
// apps/web/next.config.ts
const nextConfig: NextConfig = {
  // Enable experimental features for smaller bundles
  experimental: {
    optimizePackageImports: [
      "@platform/ui",
      "lucide-react",
      "@tiptap/react",
      "@tiptap/starter-kit",
    ],
  },

  // Webpack optimizations
  webpack: (config) => {
    // Tree-shake Lucide icons
    config.resolve.alias = {
      ...config.resolve.alias,
      "lucide-react": "lucide-react/dist/esm/icons",
    };
    return config;
  },
};
```

### 3.2 Image Optimization

```tsx
// Strategy 1: BlurHash placeholders (prevent CLS)
<Image
  src={imageUrl}
  width={600}
  height={400}
  placeholder="blur"
  blurDataURL={blurhashToDataURL(blurhash)}
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  loading="lazy"
/>

// Strategy 2: Priority loading for above-the-fold images
<Image
  src={heroImage}
  priority
  fetchPriority="high"
/>

// Strategy 3: Responsive images with srcSet
// Next.js Image component handles this automatically
// Serves WebP/AVIF when supported
```

### 3.3 Font Optimization

```css
/* Variable fonts = single file for all weights */
@font-face {
  font-family: "Heebo";
  src: url("/fonts/heebo/Heebo-Variable.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap;  /* Show fallback immediately, swap when loaded */
}
```

```typescript
// Preload critical fonts in layout
// apps/web/app/layout.tsx
<link
  rel="preload"
  href="/fonts/heebo/Heebo-Variable.woff2"
  as="font"
  type="font/woff2"
  crossOrigin="anonymous"
/>
```

### 3.4 Code Splitting

```typescript
// Lazy load heavy components
import dynamic from "next/dynamic";

// Rich text editor (Tiptap) — only load when needed
const PostEditor = dynamic(
  () => import("@/components/forums/post-editor"),
  {
    loading: () => <Skeleton className="h-[200px]" />,
    ssr: false, // Client-side only (uses browser APIs)
  },
);

// Course video player
const LessonPlayer = dynamic(
  () => import("@/components/courses/lesson-player"),
  { ssr: false },
);

// Search dialog (command palette)
const SearchDialog = dynamic(
  () => import("@/components/search/search-dialog"),
  { ssr: false },
);

// Admin chart components
const AnalyticsChart = dynamic(
  () => import("@/components/admin/analytics-chart"),
  { ssr: false },
);
```

### 3.5 Data Fetching Optimization

```typescript
// Parallel data fetching with React Server Components
// apps/web/app/(main)/forums/[categorySlug]/[forumSlug]/[threadSlug]/page.tsx

export default async function ThreadPage({ params }: { params: { threadSlug: string } }) {
  // Fetch in parallel — don't waterfall!
  const [thread, relatedThreads, ads] = await Promise.all([
    // Main thread with posts
    trpc.thread.getBySlug.query({ slug: params.threadSlug }),
    // Sidebar: related threads
    trpc.thread.getRelated.query({ slug: params.threadSlug }),
    // Sidebar: ads for this forum
    trpc.ad.getForPlacement.query({ type: "SIDEBAR" }),
  ]);

  return (
    <div className="flex gap-6">
      <main className="flex-1">
        <ThreadDetail thread={thread} />
      </main>
      <aside className="w-80">
        <RelatedThreads threads={relatedThreads} />
        <AdPlacement ads={ads} />
      </aside>
    </div>
  );
}
```

### 3.6 Streaming & Suspense

```tsx
// Stream less critical sections while showing the main content immediately
import { Suspense } from "react";

export default async function ThreadPage({ params }: Props) {
  const thread = await trpc.thread.getBySlug.query({ slug: params.threadSlug });

  return (
    <div>
      {/* Render immediately — this is the LCP element */}
      <ThreadHeader thread={thread} />
      <PostList posts={thread.posts} />

      {/* Stream these in after the main content */}
      <Suspense fallback={<Skeleton className="h-20" />}>
        <ThreadSidebar threadId={thread.id} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-40" />}>
        <RelatedThreads forumId={thread.forumId} />
      </Suspense>
    </div>
  );
}
```

### 3.7 Infinite Scroll with Virtualization

```typescript
// For long thread post lists — virtualize to prevent DOM bloat
// apps/web/components/forums/post-list.tsx
import { useVirtualizer } from "@tanstack/react-virtual";

function PostList({ threadId }: { threadId: string }) {
  const { data, fetchNextPage, hasNextPage } = trpc.post.list.useInfiniteQuery(
    { threadId, limit: 20 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );

  const allPosts = data?.pages.flatMap((page) => page.posts) ?? [];

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: allPosts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // Estimated post height
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-[80vh] overflow-auto">
      <div style={{ height: virtualizer.getTotalSize() }} className="relative w-full">
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: "absolute",
              top: virtualItem.start,
              width: "100%",
            }}
          >
            <PostCard post={allPosts[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 4. SEO

### 4.1 Structured Data (JSON-LD)

#### Forum Thread → `DiscussionForumPosting`

```tsx
// apps/web/components/shared/seo-head.tsx

function ThreadStructuredData({ thread, posts }: { thread: Thread; posts: Post[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: thread.title,
    text: thread.content.slice(0, 500),
    author: {
      "@type": "Person",
      name: thread.author.displayName,
      url: `${BASE_URL}/u/${thread.author.username}`,
    },
    datePublished: thread.createdAt,
    dateModified: thread.updatedAt,
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/CommentAction",
        userInteractionCount: thread.postCount,
      },
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/ViewAction",
        userInteractionCount: thread.viewCount,
      },
    ],
    comment: posts.slice(0, 10).map((post) => ({
      "@type": "Comment",
      text: post.content.slice(0, 200),
      author: { "@type": "Person", name: post.author.displayName },
      datePublished: post.createdAt,
    })),
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
}
```

#### QA Thread → `QAPage`

```typescript
const qaJsonLd = {
  "@context": "https://schema.org",
  "@type": "QAPage",
  mainEntity: {
    "@type": "Question",
    name: thread.title,
    text: thread.content,
    datePublished: thread.createdAt,
    author: { "@type": "Person", name: thread.author.displayName },
    answerCount: thread.postCount,
    acceptedAnswer: acceptedPost ? {
      "@type": "Answer",
      text: acceptedPost.content.slice(0, 500),
      author: { "@type": "Person", name: acceptedPost.author.displayName },
      datePublished: acceptedPost.createdAt,
      upvoteCount: acceptedPost.likeCount,
    } : undefined,
  },
};
```

#### Course → `Course`

```typescript
const courseJsonLd = {
  "@context": "https://schema.org",
  "@type": "Course",
  name: course.title,
  description: course.shortDescription,
  provider: {
    "@type": "Organization",
    name: "Platform",
    sameAs: BASE_URL,
  },
  instructor: {
    "@type": "Person",
    name: course.instructor.displayName,
  },
  inLanguage: "he",
  courseMode: "online",
  offers: {
    "@type": "Offer",
    price: course.isFree ? "0" : (course.priceAgorot / 100).toFixed(2),
    priceCurrency: "ILS",
    availability: "https://schema.org/InStock",
  },
  aggregateRating: course.averageRating > 0 ? {
    "@type": "AggregateRating",
    ratingValue: course.averageRating,
    ratingCount: course.reviewCount,
  } : undefined,
};
```

#### Freelancer Profile → `Person`

```typescript
const freelancerJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: freelancer.displayName,
  jobTitle: freelancer.headline,
  description: freelancer.description,
  url: `${BASE_URL}/marketplace/freelancers/${freelancer.username}`,
  knowsAbout: freelancer.skills,
  address: freelancer.location ? {
    "@type": "PostalAddress",
    addressLocality: freelancer.location,
    addressCountry: "IL",
  } : undefined,
};
```

#### Classified Listing → `Product` / `JobPosting`

```typescript
// For SELLING type → Product
const productJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: listing.title,
  description: listing.description,
  image: listing.images[0],
  offers: {
    "@type": "Offer",
    price: listing.priceAgorot ? (listing.priceAgorot / 100).toFixed(2) : undefined,
    priceCurrency: "ILS",
    availability: listing.status === "ACTIVE"
      ? "https://schema.org/InStock"
      : "https://schema.org/SoldOut",
  },
};

// For JOB_OFFER type → JobPosting
const jobJsonLd = {
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: listing.title,
  description: listing.description,
  datePosted: listing.createdAt,
  validThrough: listing.expiresAt,
  employmentType: "FULL_TIME", // or extracted from listing
  jobLocation: {
    "@type": "Place",
    address: { "@type": "PostalAddress", addressLocality: listing.location },
  },
};
```

### 4.2 Meta Tags

```tsx
// apps/web/app/(main)/forums/[categorySlug]/[forumSlug]/[threadSlug]/page.tsx
import type { Metadata } from "next";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const thread = await trpc.thread.getBySlug.query({ slug: params.threadSlug });

  return {
    title: `${thread.title} | ${thread.forum.name} | Platform`,
    description: thread.content.slice(0, 160),
    openGraph: {
      title: thread.title,
      description: thread.content.slice(0, 160),
      type: "article",
      publishedTime: thread.createdAt,
      authors: [thread.author.displayName],
      locale: "he_IL",
      siteName: "Platform",
    },
    twitter: {
      card: "summary",
      title: thread.title,
      description: thread.content.slice(0, 160),
    },
    alternates: {
      canonical: `${BASE_URL}/forums/${params.categorySlug}/${params.forumSlug}/${params.threadSlug}`,
    },
  };
}
```

### 4.3 Sitemap Generation

```typescript
// apps/web/app/sitemap.ts
import { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [forums, articles, courses, freelancers] = await Promise.all([
    db.forum.findMany({ select: { slug: true, updatedAt: true } }),
    db.article.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true },
    }),
    db.course.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true },
    }),
    db.freelancerProfile.findMany({
      include: { user: { select: { username: true } } },
    }),
  ]);

  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/forums`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    ...forums.map((f) => ({
      url: `${BASE_URL}/forums/${f.slug}`,
      lastModified: f.updatedAt,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    ...articles.map((a) => ({
      url: `${BASE_URL}/articles/${a.slug}`,
      lastModified: a.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...courses.map((c) => ({
      url: `${BASE_URL}/courses/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...freelancers.map((f) => ({
      url: `${BASE_URL}/marketplace/freelancers/${f.user.username}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
```

### 4.4 robots.txt

```typescript
// apps/web/app/robots.ts
import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/settings/",
          "/messages/",
          "/notifications/",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
```

---

## 5. Performance Monitoring

| Metric | Tool | Alert Threshold |
|--------|------|----------------|
| Core Web Vitals | Vercel Analytics | LCP > 2.5s, CLS > 0.1, INP > 200ms |
| Bundle size | Next.js build output | > 10% increase |
| Lighthouse score | CI/CD (Lighthouse CI) | Performance < 90 |
| API latency | Vercel logs | p95 > 2s |
| DB query time | Prisma query logging | p95 > 100ms |
| Cache hit rate | Redis monitoring | < 80% |
| Error rate | Sentry / Vercel | > 1% of requests |

### 5.1 Bundle Budget

```jsonc
// apps/web/next.config.ts — experimental.bundlePagesRouterDependencies
// Monitor with `next build` output

// Target budgets:
// First Load JS (shared): < 100 KB
// Per-page JS: < 50 KB
// Total page weight: < 500 KB (compressed)
```

---

## 6. Progressive Enhancement

| Feature | Without JS | With JS |
|---------|-----------|---------|
| Forum browsing | Full SSR, links work | Enhanced navigation, real-time updates |
| Search | Server-rendered results | Instant search, autocomplete |
| Thread reading | Full SSR with pagination | Infinite scroll, live posts |
| Forms | Standard form submission | Client-side validation, optimistic UI |
| Images | `<img>` with srcset | BlurHash placeholders, lazy loading |
| Messages | Page reload to see new | Real-time delivery |

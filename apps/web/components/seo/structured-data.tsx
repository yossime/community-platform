// ─────────────────────────────────────────────────────────────
// Structured Data (JSON-LD) Components for SEO
// Server components that render <script type="application/ld+json">
// ─────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://platform.co.il';

// ─── TypeScript Interfaces ─────────────────────────────────

interface ThreadStructuredDataProps {
  title: string;
  slug: string;
  forumSlug: string;
  content: string;
  authorName: string;
  authorSlug: string;
  createdAt: string;
  updatedAt: string;
  postCount: number;
  forumName: string;
  replies?: Array<{
    content: string;
    authorName: string;
    createdAt: string;
  }>;
}

interface QAThreadStructuredDataProps {
  title: string;
  slug: string;
  forumSlug: string;
  content: string;
  authorName: string;
  createdAt: string;
  acceptedAnswer?: {
    content: string;
    authorName: string;
    createdAt: string;
    upvoteCount: number;
  };
  suggestedAnswers?: Array<{
    content: string;
    authorName: string;
    createdAt: string;
    upvoteCount: number;
  }>;
}

interface CourseStructuredDataProps {
  title: string;
  slug: string;
  description: string;
  shortDescription: string;
  instructorName: string;
  instructorSlug: string;
  coverImageUrl?: string;
  priceAgorot: number;
  isFree: boolean;
  level: string;
  language: string;
  averageRating: number;
  enrollmentCount: number;
  createdAt: string;
  updatedAt: string;
  modules?: Array<{
    title: string;
    lessonCount: number;
  }>;
}

interface FreelancerStructuredDataProps {
  displayName: string;
  slug: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  headline?: string;
  description?: string;
  skills: string[];
  hourlyRateAgorot?: number;
  averageRating: number;
  completedProjects: number;
}

interface ClassifiedProductStructuredDataProps {
  title: string;
  slug: string;
  description: string;
  priceAgorot?: number;
  priceLabel?: string;
  images: string[];
  location: string;
  sellerName: string;
  createdAt: string;
  status: string;
}

interface ClassifiedJobStructuredDataProps {
  title: string;
  slug: string;
  description: string;
  location: string;
  employerName: string;
  priceAgorot?: number;
  priceLabel?: string;
  createdAt: string;
  expiresAt: string;
  type: 'JOB_OFFER' | 'JOB_SEEKING';
}

interface ArticleStructuredDataProps {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  authorName: string;
  authorSlug: string;
  coverImageUrl?: string;
  publishedAt: string;
  updatedAt: string;
  categoryName: string;
}

// ─── Helper: Truncate text for structured data ──────────────

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '...';
}

// ─── Helper: Strip HTML tags ────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

// ─── Helper: Format ILS price from agorot ───────────────────

function formatPriceILS(agorot: number): string {
  return (agorot / 100).toFixed(2);
}

// ─── Helper: Map course level to schema.org ─────────────────

function mapCourseLevel(level: string): string {
  const levelMap: Record<string, string> = {
    BEGINNER: 'Beginner',
    INTERMEDIATE: 'Intermediate',
    ADVANCED: 'Advanced',
    EXPERT: 'Expert',
  };
  return levelMap[level] ?? 'Beginner';
}

// ─── Thread (DiscussionForumPosting) ────────────────────────

export function ThreadStructuredData({
  title,
  slug,
  forumSlug,
  content,
  authorName,
  authorSlug,
  createdAt,
  updatedAt,
  postCount,
  forumName,
  replies,
}: ThreadStructuredDataProps) {
  const strippedContent = stripHtml(content);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: title,
    text: truncateText(strippedContent, 500),
    url: `${BASE_URL}/forums/${forumSlug}/${slug}`,
    author: {
      '@type': 'Person',
      name: authorName,
      url: `${BASE_URL}/directory/${authorSlug}`,
    },
    datePublished: createdAt,
    dateModified: updatedAt,
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/CommentAction',
      userInteractionCount: postCount,
    },
    discussionUrl: `${BASE_URL}/forums/${forumSlug}/${slug}`,
    isPartOf: {
      '@type': 'DiscussionForum',
      name: forumName,
      url: `${BASE_URL}/forums/${forumSlug}`,
    },
    ...(replies && replies.length > 0
      ? {
          comment: replies.map((reply) => ({
            '@type': 'Comment',
            text: truncateText(stripHtml(reply.content), 300),
            author: {
              '@type': 'Person',
              name: reply.authorName,
            },
            datePublished: reply.createdAt,
          })),
        }
      : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// ─── QA Thread (QAPage) ─────────────────────────────────────

export function QAThreadStructuredData({
  title,
  slug,
  forumSlug,
  content,
  authorName,
  createdAt,
  acceptedAnswer,
  suggestedAnswers,
}: QAThreadStructuredDataProps) {
  const strippedContent = stripHtml(content);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'QAPage',
    mainEntity: {
      '@type': 'Question',
      name: title,
      text: truncateText(strippedContent, 500),
      url: `${BASE_URL}/forums/${forumSlug}/${slug}`,
      author: {
        '@type': 'Person',
        name: authorName,
      },
      dateCreated: createdAt,
      answerCount: (suggestedAnswers?.length ?? 0) + (acceptedAnswer ? 1 : 0),
      ...(acceptedAnswer
        ? {
            acceptedAnswer: {
              '@type': 'Answer',
              text: truncateText(stripHtml(acceptedAnswer.content), 500),
              author: {
                '@type': 'Person',
                name: acceptedAnswer.authorName,
              },
              dateCreated: acceptedAnswer.createdAt,
              upvoteCount: acceptedAnswer.upvoteCount,
            },
          }
        : {}),
      ...(suggestedAnswers && suggestedAnswers.length > 0
        ? {
            suggestedAnswer: suggestedAnswers.map((answer) => ({
              '@type': 'Answer',
              text: truncateText(stripHtml(answer.content), 500),
              author: {
                '@type': 'Person',
                name: answer.authorName,
              },
              dateCreated: answer.createdAt,
              upvoteCount: answer.upvoteCount,
            })),
          }
        : {}),
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// ─── Course (Course schema) ─────────────────────────────────

export function CourseStructuredData({
  title,
  slug,
  description,
  shortDescription,
  instructorName,
  instructorSlug,
  coverImageUrl,
  priceAgorot,
  isFree,
  level,
  language,
  averageRating,
  enrollmentCount,
  createdAt,
  updatedAt,
  modules,
}: CourseStructuredDataProps) {
  const strippedDescription = stripHtml(description);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: title,
    description: truncateText(strippedDescription, 500),
    abstract: shortDescription,
    url: `${BASE_URL}/courses/${slug}`,
    provider: {
      '@type': 'Organization',
      name: 'קהילת אנשי מקצוע חרדים',
      url: BASE_URL,
    },
    creator: {
      '@type': 'Person',
      name: instructorName,
      url: `${BASE_URL}/directory/${instructorSlug}`,
    },
    inLanguage: language,
    educationalLevel: mapCourseLevel(level),
    dateCreated: createdAt,
    dateModified: updatedAt,
    ...(coverImageUrl ? { image: coverImageUrl } : {}),
    offers: {
      '@type': 'Offer',
      price: isFree ? '0' : formatPriceILS(priceAgorot),
      priceCurrency: 'ILS',
      availability: 'https://schema.org/InStock',
      url: `${BASE_URL}/courses/${slug}`,
    },
    ...(averageRating > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: averageRating.toFixed(1),
            bestRating: '5',
            worstRating: '1',
            ratingCount: enrollmentCount,
          },
        }
      : {}),
    ...(modules && modules.length > 0
      ? {
          hasCourseInstance: {
            '@type': 'CourseInstance',
            courseMode: 'online',
            courseWorkload: `${modules.reduce((sum, m) => sum + m.lessonCount, 0)} lessons`,
          },
          syllabusSections: modules.map((mod) => ({
            '@type': 'Syllabus',
            name: mod.title,
          })),
        }
      : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// ─── Freelancer (Person + ProfessionalService) ──────────────

export function FreelancerStructuredData({
  displayName,
  slug,
  avatarUrl,
  bio,
  location,
  headline,
  description,
  skills,
  hourlyRateAgorot,
  averageRating,
  completedProjects,
}: FreelancerStructuredDataProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        name: displayName,
        url: `${BASE_URL}/marketplace/freelancer/${slug}`,
        ...(avatarUrl ? { image: avatarUrl } : {}),
        ...(bio ? { description: truncateText(bio, 300) } : {}),
        ...(location
          ? {
              address: {
                '@type': 'PostalAddress',
                addressLocality: location,
                addressCountry: 'IL',
              },
            }
          : {}),
        jobTitle: headline ?? 'פרילנסר',
        knowsAbout: skills,
      },
      {
        '@type': 'ProfessionalService',
        name: `${displayName} - שירותים מקצועיים`,
        url: `${BASE_URL}/marketplace/freelancer/${slug}`,
        ...(description ? { description: truncateText(description, 500) } : {}),
        provider: {
          '@type': 'Person',
          name: displayName,
        },
        ...(location
          ? {
              areaServed: {
                '@type': 'Country',
                name: 'Israel',
              },
            }
          : {}),
        ...(hourlyRateAgorot
          ? {
              priceRange: `${formatPriceILS(hourlyRateAgorot)} ILS/hour`,
            }
          : {}),
        ...(averageRating > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: averageRating.toFixed(1),
                bestRating: '5',
                worstRating: '1',
                reviewCount: completedProjects,
              },
            }
          : {}),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// ─── Classified Product (Product schema) ────────────────────

export function ClassifiedProductStructuredData({
  title,
  slug,
  description,
  priceAgorot,
  priceLabel,
  images,
  location,
  sellerName,
  createdAt,
  status,
}: ClassifiedProductStructuredDataProps) {
  const strippedDescription = stripHtml(description);

  const availabilityMap: Record<string, string> = {
    ACTIVE: 'https://schema.org/InStock',
    SOLD: 'https://schema.org/SoldOut',
    EXPIRED: 'https://schema.org/Discontinued',
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: title,
    description: truncateText(strippedDescription, 500),
    url: `${BASE_URL}/classifieds/${slug}`,
    ...(images.length > 0 ? { image: images } : {}),
    offers: {
      '@type': 'Offer',
      ...(priceAgorot != null
        ? {
            price: formatPriceILS(priceAgorot),
            priceCurrency: 'ILS',
          }
        : priceLabel
          ? { price: priceLabel }
          : {}),
      availability: availabilityMap[status] ?? 'https://schema.org/InStock',
      url: `${BASE_URL}/classifieds/${slug}`,
      seller: {
        '@type': 'Person',
        name: sellerName,
      },
      availableAtOrFrom: {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressLocality: location,
          addressCountry: 'IL',
        },
      },
      priceValidUntil: new Date(
        new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// ─── Classified Job (JobPosting schema) ─────────────────────

export function ClassifiedJobStructuredData({
  title,
  slug,
  description,
  location,
  employerName,
  priceAgorot,
  priceLabel,
  createdAt,
  expiresAt,
  type,
}: ClassifiedJobStructuredDataProps) {
  const strippedDescription = stripHtml(description);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title,
    description: truncateText(strippedDescription, 500),
    url: `${BASE_URL}/classifieds/${slug}`,
    datePosted: createdAt,
    validThrough: expiresAt,
    hiringOrganization: {
      '@type': 'Organization',
      name: employerName,
      sameAs: BASE_URL,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: location,
        addressCountry: 'IL',
      },
    },
    employmentType: type === 'JOB_OFFER' ? 'CONTRACTOR' : 'OTHER',
    ...(priceAgorot != null
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: 'ILS',
            value: {
              '@type': 'QuantitativeValue',
              value: formatPriceILS(priceAgorot),
              unitText: 'PROJECT',
            },
          },
        }
      : priceLabel
        ? {
            baseSalary: {
              '@type': 'MonetaryAmount',
              currency: 'ILS',
              value: {
                '@type': 'QuantitativeValue',
                value: priceLabel,
                unitText: 'PROJECT',
              },
            },
          }
        : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// ─── Article (Article schema) ───────────────────────────────

export function ArticleStructuredData({
  title,
  slug,
  excerpt,
  content,
  authorName,
  authorSlug,
  coverImageUrl,
  publishedAt,
  updatedAt,
  categoryName,
}: ArticleStructuredDataProps) {
  const strippedContent = stripHtml(content);
  const wordCount = strippedContent.split(/\s+/).length;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: excerpt,
    articleBody: truncateText(strippedContent, 1000),
    url: `${BASE_URL}/articles/${slug}`,
    ...(coverImageUrl ? { image: coverImageUrl } : {}),
    author: {
      '@type': 'Person',
      name: authorName,
      url: `${BASE_URL}/directory/${authorSlug}`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'קהילת אנשי מקצוע חרדים',
      url: BASE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${BASE_URL}/logo.png`,
      },
    },
    datePublished: publishedAt,
    dateModified: updatedAt,
    wordCount,
    inLanguage: 'he',
    articleSection: categoryName,
    isAccessibleForFree: true,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${BASE_URL}/articles/${slug}`,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

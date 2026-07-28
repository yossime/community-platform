# 03 — Database Schema

> Comprehensive Prisma schema documentation for the Kehila Community Platform.
> All models target **PostgreSQL 15+** with the **pgvector** extension for semantic search.

---

## Table of Contents

1. [Overview](#overview)
2. [Entity-Relationship Diagram](#entity-relationship-diagram)
3. [Enums](#enums)
4. [Models](#models)
   - [User System](#user-system)
   - [Forums](#forums)
   - [Marketplace](#marketplace)
   - [Classifieds](#classifieds)
   - [Portfolios](#portfolios)
   - [Education / LMS](#education--lms)
   - [Articles](#articles)
   - [Messaging](#messaging)
   - [Notifications](#notifications)
   - [Advertising](#advertising)
   - [Tags](#tags)
   - [Moderation](#moderation)
5. [Indexes & Constraints](#indexes--constraints)
6. [Key Design Decisions](#key-design-decisions)
7. [Migration Strategy](#migration-strategy)

---

## Overview

| Metric | Count |
|---|---|
| Enums | 25 |
| Models | 48 |
| Domain Groups | 12 |
| Database Engine | PostgreSQL 15+ |
| ORM | Prisma 5.x |
| Auth Provider | Supabase Auth |
| Payments | Stripe (Connect + Subscriptions) |
| Search | pgvector (1536-dim embeddings) |

The schema is designed around the following principles:

- **Integer currency** — all monetary values are stored in **agorot** (1/100 ILS) to avoid floating-point errors.
- **Denormalized counters** — high-read counters (`viewCount`, `postCount`, `likeCount`, etc.) are stored directly on parent records and updated via Redis-buffered background jobs.
- **Universal content moderation** — every user-generated content model carries a `moderationStatus` field.
- **Polymorphic relations** — `TagRelation`, `ContentReport`, and `ModerationLog` use `entityType` + `entityId` pairs to reference any model.
- **Self-referential hierarchies** — categories and comments support unlimited nesting through optional `parentId` self-relations.
- **Semantic search** — `SearchEmbedding` stores OpenAI `text-embedding-3-small` vectors (1536 dimensions) indexed with IVFFlat.

---

## Entity-Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER SYSTEM                                    │
│                                                                             │
│  ┌──────────┐  1:1  ┌──────────────┐                                       │
│  │   User   │──────▶│ UserSettings │                                       │
│  └────┬─────┘       └──────────────┘                                       │
│       │  1:1  ┌────────────┐                                                │
│       ├──────▶│ Membership │                                                │
│       │       └────────────┘                                                │
│       │  1:1  ┌────────────┐                                                │
│       ├──────▶│ Reputation │                                                │
│       │       └────────────┘                                                │
│       │  1:N  ┌──────────────────┐                                          │
│       ├──────▶│ UserVerification │                                          │
│       │       └──────────────────┘                                          │
│       │  N:M  ┌───────────┐  N:1  ┌─────┐                                  │
│       └──────▶│ UserSkill │──────▶│ Tag │                                   │
│               └───────────┘       └─────┘                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                FORUMS                                       │
│                                                                             │
│  ┌───────────────┐  1:N  ┌───────┐  1:N  ┌────────┐  1:N  ┌──────┐        │
│  │ ForumCategory │──────▶│ Forum │──────▶│ Thread │──────▶│ Post │        │
│  │  (self-ref)   │       └───────┘       └───┬────┘       │(self)│        │
│  └───────────────┘                           │            └──┬───┘        │
│                                    1:N       │       1:N     │             │
│                          ┌────────────────────┘    ┌─────────┘             │
│                          ▼                         ▼                       │
│                 ┌──────────────────┐      ┌──────────────┐                 │
│                 │ThreadSubscription│      │ PostReaction  │                 │
│                 └──────────────────┘      └──────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                             MARKETPLACE                                     │
│                                                                             │
│  ┌───────────────────┐       ┌─────────┐  1:N  ┌──────────┐               │
│  │ FreelancerProfile │       │ Project │──────▶│ Proposal │               │
│  └───────────────────┘       └────┬────┘       └──────────┘               │
│                                   │  1:N                                    │
│                                   ▼                                         │
│                             ┌───────────┐  1:1  ┌─────────────┐            │
│                             │ Milestone │──────▶│ Transaction │            │
│                             └───────────┘       └─────────────┘            │
│                                   │                                         │
│                              1:N  ▼                                         │
│                             ┌──────────┐                                    │
│                             │  Review  │                                    │
│                             └──────────┘                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                             CLASSIFIEDS                                     │
│                                                                             │
│  ┌────────────────────┐  1:N  ┌───────────────────┐  1:N                   │
│  │ ClassifiedCategory │──────▶│ ClassifiedListing │──────▶ ClassifiedFav.  │
│  │     (self-ref)     │       └───────────────────┘                        │
│  └────────────────────┘                                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              PORTFOLIOS                                     │
│                                                                             │
│  ┌───────────┐  1:N  ┌──────────────────┐  1:N  ┌────────────────┐        │
│  │ Portfolio │──────▶│ PortfolioProject │──────▶│ PortfolioMedia │        │
│  └───────────┘       └────────┬─────────┘       └────────────────┘        │
│                               │  1:N                                        │
│                      ┌────────┴────────┐                                    │
│                      ▼                 ▼                                    │
│              ┌───────────────┐ ┌──────────────────┐                        │
│              │ PortfolioLike │ │ PortfolioComment │                        │
│              └───────────────┘ │    (self-ref)    │                        │
│                                └──────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           EDUCATION / LMS                                   │
│                                                                             │
│  ┌────────┐ 1:N ┌──────────────┐ 1:N ┌────────┐                           │
│  │ Course │────▶│ CourseModule │────▶│ Lesson │                           │
│  └───┬────┘     └──────────────┘     └───┬────┘                           │
│      │  1:N                              │  1:N                             │
│      ▼                                   ▼                                  │
│  ┌────────────┐  1:1  ┌─────────────┐ ┌────────────────┐                  │
│  │ Enrollment │──────▶│ Certificate │ │ LessonProgress │                  │
│  └────────────┘       └─────────────┘ └────────────────┘                  │
│      │  1:N                                                                 │
│      ▼                                                                      │
│  ┌──────────────┐                                                           │
│  │ CourseReview │                                                           │
│  └──────────────┘                                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    ARTICLES / MESSAGING / NOTIFICATIONS                      │
│                                                                             │
│  ┌─────────────────┐ 1:N ┌─────────┐ 1:N ┌────────────────┐               │
│  │ ArticleCategory │────▶│ Article │────▶│ ArticleComment │               │
│  │   (self-ref)    │     └─────────┘     │   (self-ref)   │               │
│  └─────────────────┘                     └────────────────┘               │
│                                                                             │
│  ┌──────────────┐ 1:N ┌─────────────────────────┐                          │
│  │ Conversation │────▶│ ConversationParticipant │                          │
│  └──────┬───────┘     └─────────────────────────┘                          │
│         │  1:N                                                              │
│         ▼                                                                   │
│     ┌─────────┐             ┌──────────────┐                               │
│     │ Message │             │ Notification │                               │
│     │ (self)  │             └──────────────┘                               │
│     └─────────┘                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                     ADVERTISING / TAGS / MODERATION                         │
│                                                                             │
│  ┌────┐ 1:N ┌──────────────┐     ┌─────┐ 1:N ┌─────────────┐             │
│  │ Ad │────▶│ AdImpression │     │ Tag │────▶│ TagRelation │             │
│  └─┬──┘     └──────────────┘     └─────┘     └─────────────┘             │
│    │  1:N                                                                   │
│    ▼                                                                        │
│  ┌─────────┐   ┌───────────────┐   ┌────────────────┐  ┌─────────────────┐│
│  │ AdClick │   │ ContentReport │   │ ModerationLog  │  │ SearchEmbedding ││
│  └─────────┘   └───────────────┘   └────────────────┘  └─────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Enums

All 25 enums used across the schema:

```prisma
// ─── User & Auth ──────────────────────────────────────

enum Role {
  USER
  MODERATOR
  ADMIN
  SUPER_ADMIN
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  BANNED
  DEACTIVATED
}

enum Gender {
  MALE
  FEMALE
}

// ─── Membership ───────────────────────────────────────

enum MembershipTier {
  FREE
  PROFESSIONAL
  BUSINESS
  ENTERPRISE
}

enum MembershipStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  PAUSED
}

// ─── Content Moderation ───────────────────────────────

enum ModerationStatus {
  PENDING
  APPROVED
  REJECTED
  FLAGGED
  REMOVED
}

// ─── Forums ───────────────────────────────────────────

enum ThreadFormat {
  FLAT
  THREADED
  QA
}

enum ThreadStatus {
  OPEN
  CLOSED
  LOCKED
  ARCHIVED
}

enum ReactionType {
  LIKE
  HELPFUL
  INSIGHTFUL
  AGREE
  DISAGREE
  FUNNY
}

// ─── Marketplace ──────────────────────────────────────

enum ProjectStatus {
  DRAFT
  OPEN
  IN_PROGRESS
  COMPLETED
  CANCELED
  DISPUTED
}

enum ProposalStatus {
  PENDING
  SHORTLISTED
  ACCEPTED
  REJECTED
  WITHDRAWN
}

enum TransactionStatus {
  PENDING_FUNDING
  FUNDED
  IN_ESCROW
  RELEASED
  REFUNDED
  DISPUTED
}

// ─── Classifieds ──────────────────────────────────────

enum ClassifiedStatus {
  DRAFT
  ACTIVE
  SOLD
  EXPIRED
  REMOVED
}

enum ClassifiedType {
  SELLING
  BUYING
  JOB_OFFER
  JOB_SEEKING
  REAL_ESTATE
  SERVICE
  EVENT
}

// ─── Portfolios ───────────────────────────────────────

enum PortfolioVisibility {
  PUBLIC
  PRIVATE
  UNLISTED
}

// ─── Education / LMS ──────────────────────────────────

enum LessonType {
  VIDEO
  TEXT
  QUIZ
  ASSIGNMENT
}

enum EnrollmentStatus {
  ACTIVE
  COMPLETED
  PAUSED
  REFUNDED
}

// ─── Messaging ────────────────────────────────────────

enum ConversationType {
  DIRECT
  GROUP
  PROJECT
}

enum MessageType {
  TEXT
  IMAGE
  FILE
  SYSTEM
}

// ─── Notifications ────────────────────────────────────

enum NotificationType {
  THREAD_REPLY
  POST_REACTION
  MENTION
  NEW_MESSAGE
  PROPOSAL_RECEIVED
  PROPOSAL_ACCEPTED
  MILESTONE_FUNDED
  MILESTONE_RELEASED
  COURSE_ENROLLED
  NEW_FOLLOWER
  CONTENT_MODERATED
  LISTING_EXPIRING
  PORTFOLIO_LIKE
  PORTFOLIO_COMMENT
  ARTICLE_COMMENT
  REVIEW_RECEIVED
  SYSTEM_ANNOUNCEMENT
  WEEKLY_DIGEST
}

enum NotificationChannel {
  IN_APP
  EMAIL
  WHATSAPP
  PUSH
}

// ─── Advertising ──────────────────────────────────────

enum AdType {
  BANNER
  FEATURED_LISTING
  SPONSORED_THREAD
  SIDEBAR
}

enum AdStatus {
  DRAFT
  ACTIVE
  PAUSED
  COMPLETED
  REJECTED
}

// ─── Gamification ─────────────────────────────────────

enum BadgeLevel {
  NEWCOMER
  CONTRIBUTOR
  ACTIVE
  TRUSTED
  EXPERT
  LEGEND
}

// ─── Reporting ────────────────────────────────────────

enum ReportReason {
  SPAM
  INAPPROPRIATE
  HARASSMENT
  MISINFORMATION
  COPYRIGHT
  MODESTY_VIOLATION
  OTHER
}
```

---

## Models

### Prisma Data Source & Generator

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions", "fullTextSearch"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}
```

---

### User System

Six models covering authentication, settings, skills, membership, reputation, and verification.

#### 1. User

```prisma
model User {
  id              String     @id @default(cuid())
  supabaseAuthId  String     @unique
  email           String     @unique
  phone           String?
  username        String     @unique
  displayName     String
  slug            String     @unique
  role            Role       @default(USER)
  status          UserStatus @default(ACTIVE)
  gender          Gender?
  avatarUrl       String?
  coverUrl        String?
  bio             String?
  location        String?
  website         String?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  // ── Relations ──────────────────────────────────
  settings           UserSettings?
  skills             UserSkill[]
  membership         Membership?
  reputation         Reputation?
  verifications      UserVerification[]
  freelancerProfile  FreelancerProfile?
  portfolio          Portfolio?

  // Forums
  threads              Thread[]
  posts                Post[]
  threadSubscriptions  ThreadSubscription[]
  postReactions        PostReaction[]

  // Marketplace
  clientProjects       Project[]          @relation("ClientProjects")
  proposals            Proposal[]
  reviewsGiven         Review[]           @relation("ReviewsGiven")
  reviewsReceived      Review[]           @relation("ReviewsReceived")
  transactionsAsPayer  Transaction[]      @relation("TransactionPayer")
  transactionsAsPayee  Transaction[]      @relation("TransactionPayee")

  // Classifieds
  classifiedListings   ClassifiedListing[]
  classifiedFavorites  ClassifiedFavorite[]

  // Portfolios
  portfolioLikes       PortfolioLike[]
  portfolioComments    PortfolioComment[]

  // Education
  coursesCreated       Course[]
  enrollments          Enrollment[]
  certificates         Certificate[]
  courseReviews         CourseReview[]

  // Articles
  articles             Article[]
  articleComments      ArticleComment[]

  // Messaging
  conversationParticipations ConversationParticipant[]
  messagesSent               Message[]

  // Notifications
  notifications        Notification[]

  // Advertising
  ads                  Ad[]

  // Moderation
  contentReports       ContentReport[]    @relation("ReportsCreated")
  moderationActions    ModerationLog[]
  resolvedReports      ContentReport[]    @relation("ReportsResolved")

  @@index([email])
  @@index([username])
  @@index([slug])
  @@index([supabaseAuthId])
  @@index([status])
  @@index([createdAt])
  @@map("users")
}
```

#### 2. UserSettings

```prisma
model UserSettings {
  id                     String  @id @default(cuid())
  userId                 String  @unique
  language               String  @default("he")
  theme                  String  @default("light")
  emailNotifications     Boolean @default(true)
  whatsappNotifications  Boolean @default(false)
  pushNotifications      Boolean @default(false)
  digestFrequency        String  @default("WEEKLY")
  profileVisibility      String  @default("PUBLIC")
  showOnlineStatus       Boolean @default(true)
  consentTracking        Boolean @default(false)
  consentMarketing       Boolean @default(false)
  consentAiProcessing    Boolean @default(false)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_settings")
}
```

#### 3. UserSkill

```prisma
model UserSkill {
  id                String  @id @default(cuid())
  userId            String
  tagId             String
  yearsOfExperience Int?
  proficiency       String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  tag  Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([userId, tagId])
  @@index([userId])
  @@index([tagId])
  @@map("user_skills")
}
```

#### 4. Membership

```prisma
model Membership {
  id                     String           @id @default(cuid())
  userId                 String           @unique
  tier                   MembershipTier   @default(FREE)
  stripeCustomerId       String?
  stripeSubscriptionId   String?
  currentPeriodStart     DateTime?
  currentPeriodEnd       DateTime?
  status                 MembershipStatus @default(ACTIVE)
  canAccessMarketplace   Boolean          @default(false)
  canAccessAllForums     Boolean          @default(false)
  hasAiTools             Boolean          @default(false)
  hasAnalytics           Boolean          @default(false)
  canCreateCourses       Boolean          @default(false)
  hasVerifiedBadge       Boolean          @default(false)
  maxPortfolioItems      Int              @default(3)
  maxClassifieds         Int              @default(2)
  maxDailyMessages       Int              @default(5)
  maxStorageMb           Int              @default(100)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tier])
  @@index([status])
  @@index([stripeCustomerId])
  @@map("memberships")
}
```

#### 5. Reputation

```prisma
model Reputation {
  id               String     @id @default(cuid())
  userId           String     @unique
  forumScore       Int        @default(0)
  marketplaceScore Int        @default(0)
  portfolioScore   Int        @default(0)
  educationScore   Int        @default(0)
  communityTrust   Int        @default(0)
  totalScore       Int        @default(0)
  badgeLevel       BadgeLevel @default(NEWCOMER)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([totalScore])
  @@index([badgeLevel])
  @@map("reputations")
}
```

#### 6. UserVerification

```prisma
model UserVerification {
  id        String   @id @default(cuid())
  userId    String
  type      String
  code      String
  expiresAt DateTime
  verified  Boolean  @default(false)
  attempts  Int      @default(0)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([type, code])
  @@index([expiresAt])
  @@map("user_verifications")
}
```

---

### Forums

Six models covering categories, forums, threads, posts, subscriptions, and reactions.

#### 7. ForumCategory

```prisma
model ForumCategory {
  id           String  @id @default(cuid())
  name         String
  slug         String  @unique
  description  String?
  iconUrl      String?
  displayOrder Int
  parentId     String?

  parent   ForumCategory?  @relation("ForumCategoryHierarchy", fields: [parentId], references: [id], onDelete: SetNull)
  children ForumCategory[] @relation("ForumCategoryHierarchy")
  forums   Forum[]

  @@index([parentId])
  @@index([displayOrder])
  @@map("forum_categories")
}
```

#### 8. Forum

```prisma
model Forum {
  id                 String          @id @default(cuid())
  categoryId         String
  name               String
  slug               String          @unique
  description        String?
  iconUrl            String?
  accessLevel        String          @default("PUBLIC")
  genderRestriction  Gender?
  requiredMembership MembershipTier?
  isPrivate          Boolean         @default(false)
  displayOrder       Int
  threadCount        Int             @default(0)
  postCount          Int             @default(0)
  lastPostAt         DateTime?

  category ForumCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  threads  Thread[]

  @@index([categoryId])
  @@index([slug])
  @@index([displayOrder])
  @@map("forums")
}
```

#### 9. Thread

```prisma
model Thread {
  id               String           @id @default(cuid())
  forumId          String
  authorId         String
  title            String
  slug             String           @unique
  content          String           @db.Text
  format           ThreadFormat     @default(FLAT)
  status           ThreadStatus     @default(OPEN)
  moderationStatus ModerationStatus @default(PENDING)
  isPinned         Boolean          @default(false)
  isLocked         Boolean          @default(false)
  viewCount        Int              @default(0)
  postCount        Int              @default(0)
  lastPostAt       DateTime?
  lastPostById     String?
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  forum         Forum              @relation(fields: [forumId], references: [id], onDelete: Cascade)
  author        User               @relation(fields: [authorId], references: [id], onDelete: Cascade)
  posts         Post[]
  subscriptions ThreadSubscription[]

  @@index([forumId])
  @@index([authorId])
  @@index([slug])
  @@index([moderationStatus])
  @@index([status])
  @@index([isPinned, lastPostAt])
  @@index([createdAt])
  @@map("threads")
}
```

#### 10. Post

```prisma
model Post {
  id               String           @id @default(cuid())
  threadId         String
  authorId         String
  parentId         String?
  content          String           @db.Text
  moderationStatus ModerationStatus @default(PENDING)
  isAcceptedAnswer Boolean          @default(false)
  likeCount        Int              @default(0)
  reactionCounts   Json?
  editedAt         DateTime?
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  thread    Thread         @relation(fields: [threadId], references: [id], onDelete: Cascade)
  author    User           @relation(fields: [authorId], references: [id], onDelete: Cascade)
  parent    Post?          @relation("PostReplies", fields: [parentId], references: [id], onDelete: SetNull)
  children  Post[]         @relation("PostReplies")
  reactions PostReaction[]

  @@index([threadId])
  @@index([authorId])
  @@index([parentId])
  @@index([moderationStatus])
  @@index([createdAt])
  @@map("posts")
}
```

#### 11. ThreadSubscription

```prisma
model ThreadSubscription {
  id        String   @id @default(cuid())
  threadId  String
  userId    String
  createdAt DateTime @default(now())

  thread Thread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([threadId, userId])
  @@map("thread_subscriptions")
}
```

#### 12. PostReaction

```prisma
model PostReaction {
  id        String       @id @default(cuid())
  postId    String
  userId    String
  type      ReactionType
  createdAt DateTime     @default(now())

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([postId, userId, type])
  @@index([postId])
  @@index([userId])
  @@map("post_reactions")
}
```

---

### Marketplace

Six models covering freelancer profiles, projects, proposals, milestones, transactions, and reviews.

#### 13. FreelancerProfile

```prisma
model FreelancerProfile {
  id                       String   @id @default(cuid())
  userId                   String   @unique
  headline                 String?
  description              String?
  hourlyRateAgorot         Int?
  skills                   String[]
  availability             String   @default("AVAILABLE")
  portfolioUrl             String?
  stripeConnectAccountId   String?
  stripeConnectOnboarded   Boolean  @default(false)
  completedProjects        Int      @default(0)
  averageRating            Float    @default(0)
  totalEarningsAgorot      Int      @default(0)

  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  proposals Proposal[]

  @@index([availability])
  @@index([averageRating])
  @@index([skills])
  @@map("freelancer_profiles")
}
```

#### 14. Project

```prisma
model Project {
  id               String           @id @default(cuid())
  clientId         String
  title            String
  slug             String           @unique
  description      String           @db.Text
  budgetMinAgorot  Int
  budgetMaxAgorot  Int
  deadline         DateTime?
  skills           String[]
  status           ProjectStatus    @default(DRAFT)
  moderationStatus ModerationStatus @default(PENDING)
  proposalCount    Int              @default(0)
  viewCount        Int              @default(0)
  isUrgent         Boolean          @default(false)
  isFeatured       Boolean          @default(false)
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  client        User           @relation("ClientProjects", fields: [clientId], references: [id], onDelete: Cascade)
  proposals     Proposal[]
  milestones    Milestone[]
  reviews       Review[]
  conversations Conversation[]

  @@index([clientId])
  @@index([slug])
  @@index([status])
  @@index([moderationStatus])
  @@index([skills])
  @@index([createdAt])
  @@map("projects")
}
```

#### 15. Proposal

```prisma
model Proposal {
  id            String         @id @default(cuid())
  projectId     String
  freelancerId  String
  coverLetter   String         @db.Text
  priceAgorot   Int
  estimatedDays Int
  status        ProposalStatus @default(PENDING)
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  project    Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  freelancer FreelancerProfile @relation(fields: [freelancerId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([freelancerId])
  @@index([status])
  @@map("proposals")
}
```

#### 16. Milestone

```prisma
model Milestone {
  id            String    @id @default(cuid())
  projectId     String
  freelancerId  String?
  title         String
  description   String
  amountAgorot  Int
  dueDate       DateTime?
  status        String    @default("PENDING")
  deliverables  String?
  completedAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  project      Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  transactions Transaction[]

  @@index([projectId])
  @@index([status])
  @@map("milestones")
}
```

#### 17. Transaction

```prisma
model Transaction {
  id                    String            @id @default(cuid())
  milestoneId           String
  payerId               String
  payeeId               String
  amountAgorot          Int
  platformFeeAgorot     Int
  status                TransactionStatus @default(PENDING_FUNDING)
  stripePaymentIntentId String?
  stripeTransferId      String?
  createdAt             DateTime          @default(now())
  updatedAt             DateTime          @updatedAt

  milestone Milestone @relation(fields: [milestoneId], references: [id], onDelete: Cascade)
  payer     User      @relation("TransactionPayer", fields: [payerId], references: [id], onDelete: Cascade)
  payee     User      @relation("TransactionPayee", fields: [payeeId], references: [id], onDelete: Cascade)

  @@index([milestoneId])
  @@index([payerId])
  @@index([payeeId])
  @@index([status])
  @@index([stripePaymentIntentId])
  @@map("transactions")
}
```

#### 18. Review

```prisma
model Review {
  id                  String   @id @default(cuid())
  projectId           String
  reviewerId          String
  revieweeId          String
  rating              Int
  communicationRating Int?
  qualityRating       Int?
  timelinessRating    Int?
  comment             String?  @db.Text
  createdAt           DateTime @default(now())

  project  Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  reviewer User    @relation("ReviewsGiven", fields: [reviewerId], references: [id], onDelete: Cascade)
  reviewee User    @relation("ReviewsReceived", fields: [revieweeId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([reviewerId])
  @@index([revieweeId])
  @@index([rating])
  @@map("reviews")
}
```

---

### Classifieds

Three models for classified listings with categories and user favorites.

#### 19. ClassifiedCategory

```prisma
model ClassifiedCategory {
  id           String  @id @default(cuid())
  name         String
  slug         String  @unique
  description  String?
  iconUrl      String?
  parentId     String?
  displayOrder Int

  parent   ClassifiedCategory?  @relation("ClassifiedCategoryHierarchy", fields: [parentId], references: [id], onDelete: SetNull)
  children ClassifiedCategory[] @relation("ClassifiedCategoryHierarchy")
  listings ClassifiedListing[]

  @@index([parentId])
  @@index([displayOrder])
  @@map("classified_categories")
}
```

#### 20. ClassifiedListing

```prisma
model ClassifiedListing {
  id               String           @id @default(cuid())
  categoryId       String
  authorId         String
  title            String
  slug             String           @unique
  description      String           @db.Text
  type             ClassifiedType
  priceAgorot      Int?
  priceLabel       String?
  images           String[]
  contactPhone     String?
  contactEmail     String?
  contactWhatsApp  String?
  location         String
  status           ClassifiedStatus @default(DRAFT)
  moderationStatus ModerationStatus @default(PENDING)
  isFeatured       Boolean          @default(false)
  expiresAt        DateTime
  viewCount        Int              @default(0)
  favoriteCount    Int              @default(0)
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  category  ClassifiedCategory   @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  author    User                 @relation(fields: [authorId], references: [id], onDelete: Cascade)
  favorites ClassifiedFavorite[]

  @@index([categoryId])
  @@index([authorId])
  @@index([slug])
  @@index([type])
  @@index([status])
  @@index([moderationStatus])
  @@index([expiresAt])
  @@index([location])
  @@index([createdAt])
  @@map("classified_listings")
}
```

#### 21. ClassifiedFavorite

```prisma
model ClassifiedFavorite {
  id        String   @id @default(cuid())
  listingId String
  userId    String
  createdAt DateTime @default(now())

  listing ClassifiedListing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  user    User              @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([listingId, userId])
  @@index([userId])
  @@map("classified_favorites")
}
```

---

### Portfolios

Five models for creative portfolios with media, likes, and comments.

#### 22. Portfolio

```prisma
model Portfolio {
  id           String              @id @default(cuid())
  userId       String              @unique
  title        String
  description  String?
  visibility   PortfolioVisibility @default(PUBLIC)
  customDomain String?
  viewCount    Int                 @default(0)
  likeCount    Int                 @default(0)

  user     User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  projects PortfolioProject[]

  @@index([visibility])
  @@map("portfolios")
}
```

#### 23. PortfolioProject

```prisma
model PortfolioProject {
  id            String    @id @default(cuid())
  portfolioId   String
  title         String
  slug          String    @unique
  description   String    @db.Text
  processNotes  String?   @db.Text
  coverImageUrl String
  category      String?
  tags          String[]
  tools         String[]
  completedAt   DateTime?
  displayOrder  Int
  viewCount     Int       @default(0)
  likeCount     Int       @default(0)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  portfolio Portfolio          @relation(fields: [portfolioId], references: [id], onDelete: Cascade)
  media     PortfolioMedia[]
  likes     PortfolioLike[]
  comments  PortfolioComment[]

  @@index([portfolioId])
  @@index([slug])
  @@index([category])
  @@index([createdAt])
  @@map("portfolio_projects")
}
```

#### 24. PortfolioMedia

```prisma
model PortfolioMedia {
  id           String  @id @default(cuid())
  projectId    String
  url          String
  type         String
  caption      String?
  displayOrder Int
  width        Int?
  height       Int?
  blurhash     String?

  project PortfolioProject @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@map("portfolio_media")
}
```

#### 25. PortfolioLike

```prisma
model PortfolioLike {
  id        String   @id @default(cuid())
  projectId String
  userId    String
  createdAt DateTime @default(now())

  project PortfolioProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
  @@index([userId])
  @@map("portfolio_likes")
}
```

#### 26. PortfolioComment

```prisma
model PortfolioComment {
  id               String           @id @default(cuid())
  projectId        String
  authorId         String
  parentId         String?
  content          String           @db.Text
  moderationStatus ModerationStatus @default(PENDING)
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  project  PortfolioProject   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  author   User               @relation(fields: [authorId], references: [id], onDelete: Cascade)
  parent   PortfolioComment?  @relation("PortfolioCommentReplies", fields: [parentId], references: [id], onDelete: SetNull)
  children PortfolioComment[] @relation("PortfolioCommentReplies")

  @@index([projectId])
  @@index([authorId])
  @@index([parentId])
  @@index([moderationStatus])
  @@map("portfolio_comments")
}
```

---

### Education / LMS

Seven models for courses, modules, lessons, enrollments, progress tracking, certificates, and reviews.

#### 27. Course

```prisma
model Course {
  id               String           @id @default(cuid())
  instructorId     String
  title            String
  slug             String           @unique
  description      String           @db.Text
  shortDescription String
  coverImageUrl    String?
  priceAgorot      Int              @default(0)
  isFree           Boolean          @default(false)
  stripeProductId  String?
  stripePriceId    String?
  level            String           @default("BEGINNER")
  language         String           @default("he")
  moderationStatus ModerationStatus @default(PENDING)
  isPublished      Boolean          @default(false)
  enrollmentCount  Int              @default(0)
  averageRating    Float            @default(0)
  totalRevenue     Int              @default(0)
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  instructor  User           @relation(fields: [instructorId], references: [id], onDelete: Cascade)
  modules     CourseModule[]
  enrollments Enrollment[]
  reviews     CourseReview[]

  @@index([instructorId])
  @@index([slug])
  @@index([moderationStatus])
  @@index([isPublished])
  @@index([level])
  @@index([language])
  @@index([priceAgorot])
  @@index([averageRating])
  @@index([createdAt])
  @@map("courses")
}
```

#### 28. CourseModule

```prisma
model CourseModule {
  id           String  @id @default(cuid())
  courseId      String
  title        String
  description  String?
  displayOrder Int

  course  Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  lessons Lesson[]

  @@index([courseId])
  @@index([displayOrder])
  @@map("course_modules")
}
```

#### 29. Lesson

```prisma
model Lesson {
  id                   String     @id @default(cuid())
  moduleId             String
  title                String
  type                 LessonType
  content              String?    @db.Text
  videoUrl             String?
  videoDurationSeconds Int?
  quizData             Json?
  assignmentData       Json?
  displayOrder         Int
  isFree               Boolean    @default(false)

  module   CourseModule     @relation(fields: [moduleId], references: [id], onDelete: Cascade)
  progress LessonProgress[]

  @@index([moduleId])
  @@index([displayOrder])
  @@map("lessons")
}
```

#### 30. Enrollment

```prisma
model Enrollment {
  id                    String           @id @default(cuid())
  courseId              String
  userId               String
  status               EnrollmentStatus @default(ACTIVE)
  progress             Float            @default(0)
  completedLessons     Int              @default(0)
  totalLessons         Int
  stripePaymentIntentId String?
  enrolledAt           DateTime         @default(now())
  completedAt          DateTime?

  course         Course           @relation(fields: [courseId], references: [id], onDelete: Cascade)
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  lessonProgress LessonProgress[]
  certificate    Certificate?

  @@unique([courseId, userId])
  @@index([courseId])
  @@index([userId])
  @@index([status])
  @@map("enrollments")
}
```

#### 31. LessonProgress

```prisma
model LessonProgress {
  id               String    @id @default(cuid())
  lessonId         String
  enrollmentId     String
  completed        Boolean   @default(false)
  score            Float?
  timeSpentSeconds Int       @default(0)
  completedAt      DateTime?

  lesson     Lesson     @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  enrollment Enrollment @relation(fields: [enrollmentId], references: [id], onDelete: Cascade)

  @@unique([lessonId, enrollmentId])
  @@index([enrollmentId])
  @@map("lesson_progress")
}
```

#### 32. Certificate

```prisma
model Certificate {
  id             String   @id @default(cuid())
  enrollmentId   String   @unique
  userId         String
  courseId        String
  certificateUrl String
  issuedAt       DateTime @default(now())

  enrollment Enrollment @relation(fields: [enrollmentId], references: [id], onDelete: Cascade)
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([courseId])
  @@map("certificates")
}
```

#### 33. CourseReview

```prisma
model CourseReview {
  id        String   @id @default(cuid())
  courseId   String
  userId    String
  rating    Int
  comment   String?  @db.Text
  createdAt DateTime @default(now())

  course Course @relation(fields: [courseId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([courseId, userId])
  @@index([courseId])
  @@index([rating])
  @@map("course_reviews")
}
```

---

### Articles

Three models for articles with categories and threaded comments.

#### 34. ArticleCategory

```prisma
model ArticleCategory {
  id           String  @id @default(cuid())
  name         String
  slug         String  @unique
  description  String?
  parentId     String?
  displayOrder Int

  parent   ArticleCategory?  @relation("ArticleCategoryHierarchy", fields: [parentId], references: [id], onDelete: SetNull)
  children ArticleCategory[] @relation("ArticleCategoryHierarchy")
  articles Article[]

  @@index([parentId])
  @@index([displayOrder])
  @@map("article_categories")
}
```

#### 35. Article

```prisma
model Article {
  id               String           @id @default(cuid())
  authorId         String
  categoryId       String
  title            String
  slug             String           @unique
  content          String           @db.Text
  excerpt          String
  coverImageUrl    String?
  metaTitle        String?
  metaDescription  String?
  isPublished      Boolean          @default(false)
  isEditorsPick    Boolean          @default(false)
  moderationStatus ModerationStatus @default(PENDING)
  viewCount        Int              @default(0)
  likeCount        Int              @default(0)
  commentCount     Int              @default(0)
  publishedAt      DateTime?
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  author   User             @relation(fields: [authorId], references: [id], onDelete: Cascade)
  category ArticleCategory  @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  comments ArticleComment[]

  @@index([authorId])
  @@index([categoryId])
  @@index([slug])
  @@index([isPublished])
  @@index([isEditorsPick])
  @@index([moderationStatus])
  @@index([publishedAt])
  @@index([createdAt])
  @@map("articles")
}
```

#### 36. ArticleComment

```prisma
model ArticleComment {
  id               String           @id @default(cuid())
  articleId        String
  authorId         String
  parentId         String?
  content          String           @db.Text
  moderationStatus ModerationStatus @default(PENDING)
  likeCount        Int              @default(0)
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  article  Article          @relation(fields: [articleId], references: [id], onDelete: Cascade)
  author   User             @relation(fields: [authorId], references: [id], onDelete: Cascade)
  parent   ArticleComment?  @relation("ArticleCommentReplies", fields: [parentId], references: [id], onDelete: SetNull)
  children ArticleComment[] @relation("ArticleCommentReplies")

  @@index([articleId])
  @@index([authorId])
  @@index([parentId])
  @@index([moderationStatus])
  @@map("article_comments")
}
```

---

### Messaging

Three models for conversations, participants, and messages.

#### 37. Conversation

```prisma
model Conversation {
  id        String           @id @default(cuid())
  type      ConversationType
  title     String?
  projectId String?
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  project      Project?                  @relation(fields: [projectId], references: [id], onDelete: SetNull)
  participants ConversationParticipant[]
  messages     Message[]

  @@index([type])
  @@index([projectId])
  @@index([updatedAt])
  @@map("conversations")
}
```

#### 38. ConversationParticipant

```prisma
model ConversationParticipant {
  id             String    @id @default(cuid())
  conversationId String
  userId         String
  lastReadAt     DateTime?
  unreadCount    Int       @default(0)
  joinedAt       DateTime  @default(now())
  isAdmin        Boolean   @default(false)

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([conversationId, userId])
  @@index([userId])
  @@index([unreadCount])
  @@map("conversation_participants")
}
```

#### 39. Message

```prisma
model Message {
  id              String      @id @default(cuid())
  conversationId  String
  senderId        String
  type            MessageType @default(TEXT)
  content         String      @db.Text
  replyToId       String?
  attachmentUrl   String?
  attachmentName  String?
  isEdited        Boolean     @default(false)
  createdAt       DateTime    @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       User         @relation(fields: [senderId], references: [id], onDelete: Cascade)
  replyTo      Message?     @relation("MessageReplies", fields: [replyToId], references: [id], onDelete: SetNull)
  replies      Message[]    @relation("MessageReplies")

  @@index([conversationId])
  @@index([senderId])
  @@index([createdAt])
  @@map("messages")
}
```

---

### Notifications

Single model covering all notification types with multi-channel delivery tracking.

#### 40. Notification

```prisma
model Notification {
  id             String               @id @default(cuid())
  userId         String
  type           NotificationType
  title          String
  body           String
  data           Json?
  channels       NotificationChannel[]
  readAt         DateTime?
  emailSentAt    DateTime?
  whatsappSentAt DateTime?
  pushSentAt     DateTime?
  actionUrl      String?
  createdAt      DateTime             @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([type])
  @@index([readAt])
  @@index([createdAt])
  @@index([userId, readAt])
  @@map("notifications")
}
```

---

### Advertising

Three models for ad management with impression and click tracking.

#### 41. Ad

```prisma
model Ad {
  id                String           @id @default(cuid())
  advertiserId      String
  type              AdType
  title             String
  content           String
  imageUrl          String?
  targetUrl         String
  status            AdStatus         @default(DRAFT)
  budgetAgorot      Int
  spentAgorot       Int              @default(0)
  targetForums      String[]
  targetLocations   String[]
  targetMemberships MembershipTier[]
  startDate         DateTime
  endDate           DateTime
  impressionCount   Int              @default(0)
  clickCount        Int              @default(0)
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  advertiser  User           @relation(fields: [advertiserId], references: [id], onDelete: Cascade)
  impressions AdImpression[]
  clicks      AdClick[]

  @@index([advertiserId])
  @@index([status])
  @@index([type])
  @@index([startDate, endDate])
  @@map("ads")
}
```

#### 42. AdImpression

```prisma
model AdImpression {
  id        String   @id @default(cuid())
  adId      String
  userId    String?
  sessionId String
  ipHash    String
  createdAt DateTime @default(now())

  ad Ad @relation(fields: [adId], references: [id], onDelete: Cascade)

  @@index([adId])
  @@index([userId])
  @@index([createdAt])
  @@map("ad_impressions")
}
```

#### 43. AdClick

```prisma
model AdClick {
  id        String   @id @default(cuid())
  adId      String
  userId    String?
  sessionId String
  ipHash    String
  createdAt DateTime @default(now())

  ad Ad @relation(fields: [adId], references: [id], onDelete: Cascade)

  @@index([adId])
  @@index([userId])
  @@index([createdAt])
  @@map("ad_clicks")
}
```

---

### Tags

Two models for a universal, polymorphic tagging system.

#### 44. Tag

```prisma
model Tag {
  id          String  @id @default(cuid())
  name        String  @unique
  slug        String  @unique
  category    String
  description String?
  usageCount  Int     @default(0)

  userSkills UserSkill[]
  relations  TagRelation[]

  @@index([category])
  @@index([usageCount])
  @@index([slug])
  @@map("tags")
}
```

#### 45. TagRelation

```prisma
model TagRelation {
  id         String   @id @default(cuid())
  tagId      String
  entityType String
  entityId   String
  createdAt  DateTime @default(now())

  tag Tag @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([tagId, entityType, entityId])
  @@index([entityType, entityId])
  @@index([tagId])
  @@map("tag_relations")
}
```

---

### Moderation

Three models for content reporting, moderation logging, and semantic search embeddings.

#### 46. ContentReport

```prisma
model ContentReport {
  id           String       @id @default(cuid())
  reporterId   String
  entityType   String
  entityId     String
  reason       ReportReason
  description  String?
  status       String       @default("PENDING")
  resolvedById String?
  resolvedAt   DateTime?
  resolution   String?
  createdAt    DateTime     @default(now())

  reporter   User  @relation("ReportsCreated", fields: [reporterId], references: [id], onDelete: Cascade)
  resolvedBy User? @relation("ReportsResolved", fields: [resolvedById], references: [id], onDelete: SetNull)

  @@index([reporterId])
  @@index([entityType, entityId])
  @@index([status])
  @@index([createdAt])
  @@map("content_reports")
}
```

#### 47. ModerationLog

```prisma
model ModerationLog {
  id             String            @id @default(cuid())
  moderatorId    String?
  entityType     String
  entityId       String
  action         String
  reason         String?
  aiConfidence   Float?
  isAutomatic    Boolean           @default(false)
  previousStatus ModerationStatus?
  newStatus      ModerationStatus
  createdAt      DateTime          @default(now())

  moderator User? @relation(fields: [moderatorId], references: [id], onDelete: SetNull)

  @@index([moderatorId])
  @@index([entityType, entityId])
  @@index([action])
  @@index([isAutomatic])
  @@index([createdAt])
  @@map("moderation_logs")
}
```

#### 48. SearchEmbedding

```prisma
model SearchEmbedding {
  id         String                       @id @default(cuid())
  entityType String
  entityId   String
  embedding  Unsupported("vector(1536)")
  content    String                       @db.Text
  createdAt  DateTime                     @default(now())
  updatedAt  DateTime                     @updatedAt

  @@unique([entityType, entityId])
  @@index([entityType])
  @@map("search_embeddings")
}

// NOTE: The IVFFlat index on the embedding column must be created via raw SQL migration:
//
//   CREATE INDEX search_embeddings_embedding_idx
//     ON search_embeddings
//     USING ivfflat (embedding vector_cosine_ops)
//     WITH (lists = 100);
//
// This cannot be expressed in Prisma schema syntax and must be added as a
// manual migration step. See the Migration Strategy section below.
```

---

## Indexes & Constraints

### Composite Unique Constraints

| Model | Constraint | Purpose |
|---|---|---|
| `UserSkill` | `@@unique([userId, tagId])` | One skill entry per user per tag |
| `ThreadSubscription` | `@@unique([threadId, userId])` | One subscription per user per thread |
| `PostReaction` | `@@unique([postId, userId, type])` | One reaction of each type per user per post |
| `ClassifiedFavorite` | `@@unique([listingId, userId])` | One favorite per user per listing |
| `PortfolioLike` | `@@unique([projectId, userId])` | One like per user per portfolio project |
| `Enrollment` | `@@unique([courseId, userId])` | One enrollment per user per course |
| `LessonProgress` | `@@unique([lessonId, enrollmentId])` | One progress record per lesson per enrollment |
| `CourseReview` | `@@unique([courseId, userId])` | One review per user per course |
| `ConversationParticipant` | `@@unique([conversationId, userId])` | One participation record per user per conversation |
| `TagRelation` | `@@unique([tagId, entityType, entityId])` | One tag-to-entity link per combination |
| `SearchEmbedding` | `@@unique([entityType, entityId])` | One embedding per entity |

### Key Composite Indexes

| Model | Index | Use Case |
|---|---|---|
| `Thread` | `@@index([isPinned, lastPostAt])` | Forum thread listing: pinned first, then by activity |
| `Notification` | `@@index([userId, readAt])` | Unread notification count per user |
| `Ad` | `@@index([startDate, endDate])` | Active ad lookup by date range |
| `TagRelation` | `@@index([entityType, entityId])` | Find all tags for a given entity |
| `ContentReport` | `@@index([entityType, entityId])` | Find all reports for a given entity |
| `ModerationLog` | `@@index([entityType, entityId])` | Find moderation history for a given entity |
| `UserVerification` | `@@index([type, code])` | Verification code lookup |

### Single-Column Unique Constraints

| Model | Field | Purpose |
|---|---|---|
| `User` | `supabaseAuthId` | Link to Supabase Auth |
| `User` | `email` | Unique email per account |
| `User` | `username` | Unique username for @mentions |
| `User` | `slug` | Unique URL-safe profile path |
| `ForumCategory` | `slug` | Unique category URL path |
| `Forum` | `slug` | Unique forum URL path |
| `Thread` | `slug` | Unique thread URL path |
| `Project` | `slug` | Unique project URL path |
| `ClassifiedCategory` | `slug` | Unique classified category URL path |
| `ClassifiedListing` | `slug` | Unique listing URL path |
| `PortfolioProject` | `slug` | Unique portfolio project URL path |
| `Course` | `slug` | Unique course URL path |
| `ArticleCategory` | `slug` | Unique article category URL path |
| `Article` | `slug` | Unique article URL path |
| `Tag` | `name` | Unique tag name |
| `Tag` | `slug` | Unique tag URL path |

---

## Key Design Decisions

### 1. All Monetary Values in Agorot (Integer)

All monetary fields use `Int` type and store values in **agorot** (1/100 of an Israeli New Shekel). This avoids floating-point precision errors that are common when storing currency as `Float` or `Decimal`.

```
100 agorot  = 1.00 ILS
15000 agorot = 150.00 ILS
```

Affected fields include: `hourlyRateAgorot`, `totalEarningsAgorot`, `budgetMinAgorot`, `budgetMaxAgorot`, `priceAgorot`, `amountAgorot`, `platformFeeAgorot`, `budgetAgorot`, `spentAgorot`, `totalRevenue`.

Conversion to display format happens exclusively in the presentation layer.

### 2. Denormalized Counters with Redis Buffering

High-frequency counters such as `viewCount`, `postCount`, `likeCount`, `threadCount`, `favoriteCount`, `impressionCount`, `clickCount`, `enrollmentCount`, and `commentCount` are stored directly on parent records to avoid expensive `COUNT(*)` queries.

**Update strategy:**

1. Increment/decrement operations are first written to **Redis** (e.g., `HINCRBY thread:{id}:counters viewCount 1`).
2. A background worker flushes accumulated deltas to PostgreSQL in batches (every 30 seconds or when a threshold is reached).
3. This approach absorbs traffic spikes (e.g., viral threads) without hammering the database with individual `UPDATE` statements.

### 3. Every UGC Model Has `moderationStatus`

All user-generated content models include a `moderationStatus` field of type `ModerationStatus`:

| Model | Content Type |
|---|---|
| `Thread` | Forum threads |
| `Post` | Forum posts |
| `Project` | Marketplace projects |
| `ClassifiedListing` | Classified ads |
| `PortfolioComment` | Portfolio comments |
| `Course` | Educational courses |
| `Article` | Articles |
| `ArticleComment` | Article comments |

Content enters the system in `PENDING` state and must be approved (either by AI auto-moderation or human moderators) before becoming visible. This is critical for maintaining community standards, including modesty guidelines specific to the Haredi community.

### 4. Self-Referential Relations for Hierarchy

Several models use an optional `parentId` field that references the same table, enabling unlimited nesting:

| Model | Relation Name | Use Case |
|---|---|---|
| `ForumCategory` | `ForumCategoryHierarchy` | Nested forum categories (e.g., "Tech > Web Dev > Frontend") |
| `ClassifiedCategory` | `ClassifiedCategoryHierarchy` | Nested classified categories |
| `ArticleCategory` | `ArticleCategoryHierarchy` | Nested article categories |
| `Post` | `PostReplies` | Nested/threaded forum replies |
| `PortfolioComment` | `PortfolioCommentReplies` | Nested portfolio comments |
| `ArticleComment` | `ArticleCommentReplies` | Nested article comments |
| `Message` | `MessageReplies` | Reply-to threading in conversations |

All self-relations use `onDelete: SetNull` to preserve child records when a parent is removed.

### 5. Polymorphic Relations via `entityType` + `entityId`

Three models use a polymorphic pattern with `entityType` (String) and `entityId` (String) to reference any model in the system:

| Polymorphic Model | Purpose | Example `entityType` Values |
|---|---|---|
| `TagRelation` | Attach tags to any entity | `"Thread"`, `"Project"`, `"Article"`, `"Course"` |
| `ContentReport` | Report any content | `"Post"`, `"ClassifiedListing"`, `"PortfolioComment"` |
| `ModerationLog` | Log moderation actions on any entity | `"Thread"`, `"Post"`, `"Article"`, `"Course"` |
| `SearchEmbedding` | Store search vectors for any entity | `"Thread"`, `"Project"`, `"Article"`, `"PortfolioProject"` |

This avoids creating separate join/report/log tables for every content type. The trade-off is that these relations cannot be enforced at the database level via foreign keys. Application-layer validation and the `@@index([entityType, entityId])` composite index ensure correctness and performance.

### 6. pgvector for Semantic Search Embeddings

The `SearchEmbedding` model stores 1536-dimensional vectors generated by OpenAI's `text-embedding-3-small` model. These enable semantic (meaning-based) search across all content types.

**Technical details:**

- The `embedding` column uses `Unsupported("vector(1536)")` because Prisma does not natively support the `vector` type.
- An **IVFFlat** index with `vector_cosine_ops` is created via raw SQL for approximate nearest-neighbor queries.
- Queries use `<=>` (cosine distance) operator: `ORDER BY embedding <=> $1 LIMIT 20`.
- The `lists` parameter (set to 100) should be tuned as the dataset grows (recommended: `sqrt(n)` where `n` is the row count).

### 7. Json Fields for Flexible Data

Several models use `Json` (or `Json?`) fields to store structured but schema-flexible data:

| Model | Field | Content |
|---|---|---|
| `Post` | `reactionCounts` | `{ "LIKE": 5, "HELPFUL": 3, "INSIGHTFUL": 1 }` |
| `Lesson` | `quizData` | Array of questions with options, correct answers, explanations |
| `Lesson` | `assignmentData` | Assignment instructions, rubric, submission requirements |
| `Notification` | `data` | Notification-type-specific payload (sender info, entity refs, etc.) |

Json fields are validated at the application layer using Zod schemas. This provides flexibility for rapid iteration while maintaining runtime type safety.

---

## Migration Strategy

### Initial Setup

```bash
# 1. Initialize Prisma
npx prisma init

# 2. Enable the pgvector extension (in the first migration)
# Add to the migration SQL:
#   CREATE EXTENSION IF NOT EXISTS vector;

# 3. Generate the initial migration
npx prisma migrate dev --name init

# 4. Apply the IVFFlat index (manual migration)
npx prisma migrate dev --name add_vector_index --create-only
# Then edit the generated SQL file to add:
#   CREATE INDEX search_embeddings_embedding_idx
#     ON search_embeddings
#     USING ivfflat (embedding vector_cosine_ops)
#     WITH (lists = 100);

# 5. Apply the migration
npx prisma migrate dev
```

### Ongoing Migration Guidelines

| Guideline | Details |
|---|---|
| **Never drop columns in production** | Use a multi-step process: add new column, backfill, update code, then remove old column in a later migration. |
| **Add indexes concurrently** | Use `CREATE INDEX CONCURRENTLY` in production to avoid table locks. This requires raw SQL migrations. |
| **Seed data for categories** | Forum categories, classified categories, article categories, and tags should be seeded via `prisma/seed.ts`. |
| **Environment-specific migrations** | Use `prisma migrate deploy` in CI/CD (no interactive prompts). Use `prisma migrate dev` only in development. |
| **Schema drift checks** | Run `prisma migrate diff` in CI to detect drift between the schema and the database. |
| **Backup before migration** | Always snapshot the database before running migrations in staging/production. |

### Seeding Strategy

```typescript
// prisma/seed.ts — abbreviated structure
async function main() {
  // 1. Forum categories (with hierarchy)
  await seedForumCategories();

  // 2. Classified categories (with hierarchy)
  await seedClassifiedCategories();

  // 3. Article categories
  await seedArticleCategories();

  // 4. Tags (skills, topics, tools)
  await seedTags();

  // 5. Default admin user
  await seedAdminUser();
}
```

### Production Deployment Checklist

1. Run `prisma migrate diff` to review pending changes.
2. Take a database snapshot / backup.
3. Run `prisma migrate deploy` in the CI/CD pipeline.
4. Verify the migration succeeded with `prisma migrate status`.
5. Run application-level smoke tests against the updated schema.
6. Monitor query performance for any new indexes or schema changes.

---

> **Document version:** 1.0
> **Last updated:** 2026-02-21
> **Schema model count:** 48 models, 25 enums
> **Target database:** PostgreSQL 15+ with pgvector extension

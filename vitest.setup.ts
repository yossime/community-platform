// Global test setup
import { vi } from 'vitest';

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test';
process.env.UPSTASH_REDIS_REST_URL = 'http://localhost:6379';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_placeholder';
process.env.MEILISEARCH_HOST = 'http://localhost:7700';
process.env.MEILISEARCH_API_KEY = 'test-meilisearch-key';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.NEXT_PUBLIC_WS_URL = 'http://localhost:3002';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.REVALIDATION_SECRET = 'test-revalidation-secret';
process.env.WHATSAPP_TOKEN = 'test-whatsapp-token';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-id';
process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify-token';

// Mock Prisma client
vi.mock('@platform/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    userSettings: { create: vi.fn(), update: vi.fn() },
    userVerification: { findFirst: vi.fn(), update: vi.fn() },
    membership: { create: vi.fn() },
    reputation: { create: vi.fn() },
    thread: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    post: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    forum: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    forumCategory: { findMany: vi.fn() },
    notification: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    conversationParticipant: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn() },
    message: { findMany: vi.fn(), create: vi.fn() },
    project: { findMany: vi.fn(), update: vi.fn() },
    moderationLog: { create: vi.fn() },
    article: { findMany: vi.fn() },
    $transaction: vi.fn((fn: unknown) => typeof fn === 'function' ? fn({}) : Promise.all(fn as unknown[])),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  },
}));

// Mock Redis cache
vi.mock('@platform/cache/src/client', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    keys: vi.fn().mockResolvedValue([]),
    scan: vi.fn().mockResolvedValue([0, []]),
  },
}));

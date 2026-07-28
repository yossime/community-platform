# Development Guide

How to set up a local environment, and the conventions this codebase follows.
For architecture specifications, see [`docs/architecture/`](./architecture/).
For production deployment, see [`DEPLOY.md`](../DEPLOY.md).

---

## Prerequisites

- **Node.js 20 LTS**
- **pnpm** (`npm i -g pnpm`) — the repo pins the version via `packageManager` in `package.json`
- **Docker** (for the local Postgres / Redis / Meilisearch stack)

## Getting Started

```bash
# 1. Install dependencies (all workspaces)
pnpm install

# 2. Start the local infrastructure stack
#    PostgreSQL 15 + pgvector, Redis 7, Meilisearch, MailDev
cd infrastructure/docker
cp .env.example .env
docker compose up -d
cd ../..

# 3. Configure environment
cp .env.example .env.local
# Fill in values — for local dev the docker-compose defaults are:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/platform_dev
#   DIRECT_URL=postgresql://postgres:postgres@localhost:5432/platform_dev
#   MEILISEARCH_HOST=http://localhost:7700
#   MEILISEARCH_API_KEY=dev-master-key

# 4. Generate the Prisma client and push the schema
pnpm db:generate
pnpm db:push

# 5. (Optional) Seed development data
pnpm db:seed

# 6. Run everything in dev mode
pnpm dev
```

## Common Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run all apps in dev mode (Turborepo) |
| `pnpm build` | Build all workspaces |
| `pnpm typecheck` | TypeScript across all 15 workspaces |
| `pnpm lint` | ESLint across all workspaces |
| `pnpm test` | Vitest unit tests |
| `pnpm test:coverage` | Unit tests with coverage |
| `pnpm test:e2e` | Playwright E2E tests |
| `pnpm db:generate` / `db:push` / `db:migrate` / `db:seed` | Prisma workflows |
| `pnpm format` | Prettier over the whole repo |

## Monorepo Layout

```
apps/
  web/              Next.js 14 App Router app (Vercel)
  ws-server/        Socket.IO server (ECS Fargate)
packages/
  api/              tRPC v11 — 13 routers
  db/               Prisma schema (48 models, 25 enums) + migrations + seed
  ui/               Shared RTL-first component library (shadcn/ui base)
  ai/               OpenAI wrappers: moderation, embeddings, matching, summarization
  payments/         Stripe Connect: subscriptions, escrow, webhooks
  email/            React Email templates + Resend client
  whatsapp/         WhatsApp Cloud API client + OTP verification
  search/           Meilisearch client, index definitions, DB sync
  cache/            Upstash Redis: write-through, rate limiting, counters
  config/           Shared TypeScript/ESLint/Tailwind configs
workers/
  ai-worker/        Lambda: moderation + embeddings (SQS-driven)
  search-indexer/   Lambda: Meilisearch sync
  notification-worker/  Lambda: email, WhatsApp, push
  media-processor/  Lambda: resize, WebP, BlurHash, EXIF strip, modesty check
infrastructure/
  terraform/        AWS IaC (ECS, Lambda, SQS, SNS, EventBridge, EC2 Meilisearch)
  docker/           Local dev stack + worker/ws-server Dockerfiles
  scripts/          deploy, migrate, seed, reindex helpers
e2e/                Playwright specs
docs/architecture/  15 specification documents
```

Full detail: [`docs/architecture/02-MONOREPO-STRUCTURE.md`](./architecture/02-MONOREPO-STRUCTURE.md).

---

## Coding Conventions

### RTL-first — logical properties only

The UI is Hebrew, right-to-left. Physical CSS properties break when the
direction flips, so only logical properties are used:

| Use | Instead of |
|---|---|
| `ms-4`, `me-4`, `ps-4`, `pe-4` | `ml-4`, `mr-4`, `pl-4`, `pr-4` |
| `start-0`, `end-0` | `left-0`, `right-0` |
| `text-start`, `text-end` | `text-left`, `text-right` |
| `border-s`, `rounded-s` | `border-l`, `rounded-l` |

The root layout sets `<html lang="he" dir="rtl">`. Directional icons
(arrows, chevrons, reply, undo/redo) flip in RTL context.
See [`docs/architecture/14-RTL-AND-CULTURAL.md`](./architecture/14-RTL-AND-CULTURAL.md).

### Single-origin assets

The platform must work behind strict content-filtering proxies used by much of
its audience, so **no external CDNs**: fonts are self-hosted in
`apps/web/public/fonts/` (Heebo, Rubik, Noto Sans Hebrew), no third-party
script tags, all assets served from the platform domain.

### TypeScript

- Strict mode everywhere; no `any` — use `unknown` and narrow.
- Zod for all validation: API inputs, env vars, webhook payloads.
- Infer types from Prisma; don't hand-duplicate model types.
- No barrel files — import directly from source modules.

### React / Next.js

- Server Components by default; `'use client'` only when needed.
- `<Image>` and `<Link>` for all images/navigation; `<Suspense>` streaming on data-heavy pages.
- Route groups: `(auth)` public, `(main)` authenticated.

### API (tRPC)

- Routers live in `packages/api/src/routers/`.
- Middleware chain: auth → rate-limit → moderation → logging → error.
- `TRPCError` with proper codes; Prisma transactions for multi-table mutations.

### Database (Prisma)

- Currency in **agorot** (1/100 ILS) — integers, never floats.
- pgvector columns via `Unsupported("vector(1536)")`.
- Every UGC model carries `moderationStatus`, `createdAt`, `updatedAt`.
- Soft delete (`deletedAt`) preferred over hard `DELETE`.
- Denormalized counters (viewCount, postCount) buffered through Redis.

### User-facing text

All user-facing text is Hebrew; all code, comments, and identifiers are English.

### File naming

- Components: `PascalCase.tsx` — utilities/hooks: `camelCase.ts`
- Config files: `kebab-case` — tests: `*.test.ts(x)` colocated with source.

### Testing

- **Vitest** for unit tests (colocated), **Playwright** for E2E (`e2e/`).
- Critical paths (auth, payments, moderation) require coverage.

### Commits

Conventional commits, scoped by package: `feat(api): add thread router`,
`fix(db): ...`, `docs: ...`, `chore: ...`.

---

## Adding a Feature

1. Read the relevant spec in `docs/architecture/`.
2. Start with the Prisma model if new tables are needed.
3. Create/update the tRPC router with Zod input validation.
4. Shared UI goes in `packages/ui/`; page-specific components in `apps/web/components/`.
5. Add caching for hot reads, search indexing for searchable content,
   and the moderation pipeline for anything user-generated.
6. Add tests for the critical path.

## Environment Variables

The canonical list lives in [`.env.example`](../.env.example) at the repo root
(never commit `.env.local`). CI runs with placeholder values; only local dev
against the docker-compose stack and real deployments need real values.

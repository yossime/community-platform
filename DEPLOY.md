# Production Deployment Guide

Step-by-step instructions to deploy the Kehila Community Platform to production.

---

## Prerequisites

Before you start, you need accounts on these services:

| Service | Purpose | Sign Up |
|---|---|---|
| **GitHub** | Code repository, CI/CD | github.com |
| **Vercel** | Next.js hosting | vercel.com |
| **Supabase** | Database, Auth, Storage, Realtime | supabase.com |
| **AWS** | Lambda workers, ECS, SQS, SNS | aws.amazon.com |
| **Upstash** | Redis cache | upstash.com |
| **Stripe** | Payments | stripe.com |
| **OpenAI** | AI moderation, embeddings | platform.openai.com |
| **Resend** | Transactional email | resend.com |
| **Sentry** | Error monitoring | sentry.io |
| **Domain registrar** | Domain name | Any .co.il registrar |

Also install locally:
- Node.js 20 LTS
- pnpm (`npm i -g pnpm`)
- Docker Desktop
- AWS CLI (`aws configure`)
- Terraform CLI
- Vercel CLI (`npm i -g vercel`)

---

## Step 1: Push Code to GitHub

```bash
cd community-platform

# If not already a git repo
git init
git add -A
git commit -m "feat: initial platform release — all 4 phases complete"

# Create GitHub repo (use gh CLI or github.com)
gh repo create your-org/platform --private --source=. --push
```

---

## Step 2: Set Up Supabase

1. Go to [supabase.com](https://supabase.com) → New Project
2. **Region:** EU Central (Frankfurt) — `eu-central-1`
3. Set a strong database password — save it
4. Once created, go to **Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY`
5. Go to **Settings → Database** and copy:
   - `Connection string (URI)` → `DATABASE_URL` (use the **pooled** connection for Transaction mode)
   - `Direct connection` → `DIRECT_URL` (use for migrations)

### Enable pgvector
```sql
-- Run in Supabase SQL Editor
CREATE EXTENSION IF NOT EXISTS vector;
```

### Run Migrations
```bash
# From project root
pnpm --filter @platform/db db:migrate deploy
```

### Seed Database (Optional — for initial data)
```bash
pnpm --filter @platform/db db:seed
```

### Configure Auth
In Supabase Dashboard → **Authentication → Providers**:
- Enable **Email** (with email confirmation)
- Enable **Phone** (for OTP — requires Twilio or other SMS provider)
- Disable all social providers (Google, GitHub, etc.)

In **Authentication → URL Configuration**:
- Site URL: `https://your-domain.co.il`
- Redirect URLs: `https://your-domain.co.il/verify`

In **Authentication → Email Templates**:
- Customize the email templates to match Hebrew branding

### Configure Storage
Create these buckets in **Storage**:
```
avatars         — Public, 5MB limit, image/* only
portfolio-media — Public, 50MB limit, image/*, video/*
course-content  — Private, 100MB limit
classifieds     — Public, 10MB limit, image/*
attachments     — Private, 25MB limit
temp-uploads    — Private, 50MB limit (auto-delete after 24h)
```

---

## Step 3: Set Up Upstash Redis

1. Go to [upstash.com](https://upstash.com) → Create Database
2. **Region:** EU West (Frankfurt)
3. Copy the **REST URL** and **REST Token**:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

---

## Step 4: Set Up Stripe

1. Go to [stripe.com](https://stripe.com) → Register for Israel
2. Complete verification (business type, bank details)
3. Copy from **Developers → API Keys**:
   - Publishable key → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - Secret key → `STRIPE_SECRET_KEY`

### Set Up Stripe Connect
In Stripe Dashboard → **Connect → Settings**:
- Enable Connect for marketplace payments
- Set platform fee percentage

### Set Up Webhook
In **Developers → Webhooks → Add endpoint**:
- URL: `https://your-domain.co.il/api/webhooks/stripe`
- Events to listen to:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `account.updated`
  - `transfer.created`
- Copy Signing Secret → `STRIPE_WEBHOOK_SECRET`

### Create Products (Membership Tiers)
Create 3 products in Stripe:
1. **Professional** — ₪49/month
2. **Business** — ₪99/month
3. **Enterprise** — Custom pricing

---

## Step 5: Set Up OpenAI

1. Go to [platform.openai.com](https://platform.openai.com)
2. Create an API key → `OPENAI_API_KEY`
3. Set up billing (usage-based)
4. Models used:
   - `gpt-4o-mini` for content moderation
   - `text-embedding-3-small` (1536 dims) for embeddings

---

## Step 6: Set Up Resend (Email)

1. Go to [resend.com](https://resend.com) → Create account
2. Add your domain and verify DNS records (DKIM, SPF)
3. Create API key → `RESEND_API_KEY`
4. Set "from" address: `noreply@your-domain.co.il`

---

## Step 7: Set Up Sentry

1. Go to [sentry.io](https://sentry.io) → Create project (Next.js)
2. Copy DSN → `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`
3. Create auth token → `SENTRY_AUTH_TOKEN`

---

## Step 8: Deploy to Vercel

### First-time setup
```bash
cd community-platform

# Login to Vercel
vercel login

# Link project
vercel link

# Set framework preset
# Select: Next.js
# Root directory: apps/web
```

### Set Environment Variables
In Vercel Dashboard → **Settings → Environment Variables**, add ALL variables from `.env.example` with production values.

Key variables:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
OPENAI_API_KEY=sk-xxx
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
MEILISEARCH_HOST=http://internal-meilisearch-alb.xxx
MEILISEARCH_API_KEY=xxx
RESEND_API_KEY=re_xxx
SENTRY_DSN=https://xxx@sentry.io/xxx
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
NEXT_PUBLIC_APP_URL=https://your-domain.co.il
NEXT_PUBLIC_WS_URL=wss://ws.your-domain.co.il
NEXT_PUBLIC_POSTHOG_KEY=phc_xxx
NEXT_PUBLIC_POSTHOG_HOST=https://ph.your-domain.co.il
CRON_SECRET=<generate a random 32-char string>
REVALIDATION_SECRET=<generate a random 32-char string>
```

### Configure Build
In Vercel → **Settings → General**:
- Build Command: `cd ../.. && pnpm turbo build --filter=@platform/web...`
- Output Directory: `apps/web/.next`
- Install Command: `pnpm install`
- Root Directory: `.` (repo root)

### Deploy
```bash
# Preview deploy
vercel

# Production deploy
vercel --prod
```

### Set Up Custom Domain
In Vercel → **Settings → Domains**:
1. Add your domain (e.g., `your-domain.co.il`)
2. Add the DNS records as instructed (CNAME or A record)

---

## Step 9: Deploy AWS Infrastructure (Terraform)

### Configure AWS CLI
```bash
aws configure
# Region: eu-central-1
# Output: json
```

### Create S3 Backend for Terraform State
```bash
aws s3 mb s3://platform-terraform-state-prod --region eu-central-1
aws dynamodb create-table \
  --table-name platform-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region eu-central-1
```

### Create terraform.tfvars
```bash
cd infrastructure/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with real values
```

### Apply Terraform
```bash
terraform init
terraform workspace new production
terraform plan -var="environment=production"
# Review the plan carefully
terraform apply -var="environment=production"
```

This creates:
- VPC with public/private subnets
- ECS Fargate cluster for WebSocket server
- 4 Lambda functions
- 5 SQS queues + dead-letter queues
- 3 SNS topics
- 3-node Meilisearch EC2 cluster
- Security groups, IAM roles, CloudWatch alarms

---

## Step 10: Deploy Lambda Workers

```bash
# Build and deploy all workers
./infrastructure/scripts/deploy.sh production workers
```

Or manually per worker:
```bash
cd workers/ai-worker && pnpm build
cd workers/search-indexer && pnpm build
cd workers/notification-worker && pnpm build
cd workers/media-processor && pnpm build

# Package and upload each
cd workers/ai-worker/dist && zip -r ../function.zip .
aws lambda update-function-code \
  --function-name platform-ai-worker \
  --zip-file fileb://workers/ai-worker/function.zip \
  --publish
```

---

## Step 11: Deploy WebSocket Server (ECS)

```bash
# Build Docker image
docker build -f infrastructure/docker/Dockerfile.ws-server -t platform-ws-server .

# Tag and push to ECR
aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.eu-central-1.amazonaws.com
docker tag platform-ws-server:latest <ACCOUNT_ID>.dkr.ecr.eu-central-1.amazonaws.com/platform-ws-server:latest
docker push <ACCOUNT_ID>.dkr.ecr.eu-central-1.amazonaws.com/platform-ws-server:latest

# Force new ECS deployment
aws ecs update-service --cluster platform-cluster --service ws-server --force-new-deployment
```

---

## Step 12: Initialize Meilisearch

After Terraform creates the Meilisearch cluster:

```bash
# Set the master key on the instances (done via userdata script)
# Then create indexes
pnpm --filter @platform/search reindex
```

---

## Step 13: Set Up GitHub Actions CI/CD

### Add Repository Secrets
In GitHub → **Settings → Secrets and variables → Actions**, add:

```
# Vercel
VERCEL_TOKEN=xxx
VERCEL_ORG_ID=xxx
VERCEL_PROJECT_ID=xxx

# AWS
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx

# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# All NEXT_PUBLIC_* vars
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=xxx
NEXT_PUBLIC_APP_URL=https://your-domain.co.il
NEXT_PUBLIC_WS_URL=wss://ws.your-domain.co.il
NEXT_PUBLIC_POSTHOG_KEY=xxx
NEXT_PUBLIC_POSTHOG_HOST=xxx
NEXT_PUBLIC_SENTRY_DSN=xxx

# Service keys
MEILISEARCH_HOST=xxx
MEILISEARCH_API_KEY=xxx
UPSTASH_REDIS_REST_URL=xxx
UPSTASH_REDIS_REST_TOKEN=xxx
```

### Create Production Environment
In GitHub → **Settings → Environments**:
1. Create `production` environment
2. Add required reviewers (optional but recommended)
3. Add all secrets above to this environment

After this, every push to `main` triggers the full CI/CD pipeline:
1. Lint + typecheck
2. Unit tests
3. Build
4. DB migrations
5. Deploy to Vercel (production)
6. Deploy Lambda workers
7. Deploy WebSocket server (ECS)
8. Smoke tests

---

## Step 14: DNS Configuration

Set up these DNS records:

| Type | Name | Value | Purpose |
|---|---|---|---|
| CNAME | `@` or `www` | `cname.vercel-dns.com` | Main app (Vercel) |
| CNAME | `ws` | ECS ALB DNS name | WebSocket server |
| TXT | `@` | Resend DKIM verification | Email authentication |
| TXT | `@` | Resend SPF record | Email authentication |

---

## Step 15: Post-Deploy Verification

### Health Checks
```bash
# Main app
curl https://your-domain.co.il/api/health

# Homepage
curl -I https://your-domain.co.il

# Robots.txt
curl https://your-domain.co.il/robots.txt

# Sitemap
curl https://your-domain.co.il/sitemap.xml
```

### Functional Tests
1. Register a new user (email + password)
2. Verify email
3. Login
4. Create a forum thread
5. Upload an avatar
6. Check notifications
7. Test search
8. Verify WebSocket connection (messages page)

### Security Checks
```bash
# Check CSP headers
curl -I https://your-domain.co.il | grep -i content-security

# Check HSTS
curl -I https://your-domain.co.il | grep -i strict-transport

# Verify no external resources load (Netfree test)
# Open browser DevTools → Network tab → check all requests are same-origin
```

---

## Quick Reference: Generate Secrets

```bash
# Generate random secrets for CRON_SECRET and REVALIDATION_SECRET
openssl rand -hex 32

# Or with Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Troubleshooting

### Build fails on Vercel
- Ensure all `NEXT_PUBLIC_*` env vars are set in Vercel
- Check that Prisma client is generated: build command should include `pnpm turbo db:generate`

### Database connection errors
- Check `DATABASE_URL` uses the **pooled** connection (port 6543)
- Check `DIRECT_URL` uses the **direct** connection (port 5432)
- Verify Supabase project is in `eu-central-1`

### Middleware loop / redirect issues
- The middleware only protects `/settings`, `/messages`, `/admin`
- Auth pages (`/login`, `/register`) redirect authenticated users away

### Meilisearch not working
- Verify the cluster is running: check EC2 instances in AWS console
- Verify security groups allow traffic from Lambda VPC
- Check `MEILISEARCH_HOST` points to the internal ALB

### WebSocket connection fails
- Verify ECS service is healthy: `aws ecs describe-services --cluster platform-cluster --services ws-server`
- Check security groups allow WebSocket traffic (port 3002)
- Verify `NEXT_PUBLIC_WS_URL` uses `wss://` for production

---

## Cost Estimates (Monthly)

| Service | Estimated Cost |
|---|---|
| Vercel Pro | $20 |
| Supabase Pro | $25 |
| AWS (ECS + Lambda + SQS) | $50-100 |
| Meilisearch (3x r6g.large) | $300 |
| Upstash Redis | $10 |
| Stripe | 2.9% + ₪1 per transaction |
| OpenAI | ~$20-50 (depends on usage) |
| Resend | $20 (50K emails) |
| Sentry | Free tier (5K events) |
| **Total** | **~$450-550/mo** |

> Note: Meilisearch is the biggest cost. You can start with a single smaller instance and scale later.

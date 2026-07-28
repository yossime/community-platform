# 10 — Deployment & Infrastructure

> Vercel, AWS, Supabase infrastructure, CI/CD pipelines, and scaling strategy

---

## 1. Infrastructure Overview

```
┌────────────────────────────────────────────────────────────────┐
│                   Region: eu-central-1 (Frankfurt)              │
│                                                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │    Vercel        │  │    Supabase       │  │    AWS         │ │
│  │    (fra1)        │  │    (Frankfurt)    │  │ (eu-central-1) │ │
│  │                  │  │                   │  │                │ │
│  │ • Next.js SSR    │  │ • PostgreSQL 15   │  │ • ECS Fargate  │ │
│  │ • API Routes     │  │   + pgvector      │  │   (WS server)  │ │
│  │ • tRPC Handler   │  │   + RLS           │  │ • Lambda ×4    │ │
│  │ • REST API       │  │ • Read replica    │  │ • SQS ×5+DLQs  │ │
│  │ • Cron Jobs      │  │ • Auth            │  │ • SNS ×3       │ │
│  │ • Edge Functions │  │ • Storage (S3)    │  │ • EventBridge  │ │
│  │ • Image Optim.   │  │ • Realtime        │  │ • EC2 ×3 (MS)  │ │
│  │                  │  │                   │  │ • ALB (internal)│ │
│  └─────────────────┘  └──────────────────┘  │ • VPC          │ │
│                                               │ • CloudWatch   │ │
│  ┌─────────────────┐                          └───────────────┘ │
│  │ Upstash Redis   │                                            │
│  │ (Frankfurt)     │                                            │
│  │                 │                                            │
│  │ • Cache         │                                            │
│  │ • Rate limiting │                                            │
│  │ • Pub/Sub       │                                            │
│  │ • Counters      │                                            │
│  └─────────────────┘                                            │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. Vercel Configuration

### 2.1 Next.js Deployment

```jsonc
// apps/web/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
    {
      source: "/fonts/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
  ],
};

export default nextConfig;
```

### 2.2 Vercel Cron Jobs

```jsonc
// apps/web/vercel.json
{
  "crons": [
    {
      "path": "/api/cron/digest",
      "schedule": "0 8 * * 0"
    },
    {
      "path": "/api/cron/cleanup",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron/analytics",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/cache-warm",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

| Cron Job | Schedule | Description |
|----------|----------|-------------|
| `/api/cron/digest` | Sunday 08:00 UTC | Weekly digest email to subscribed users |
| `/api/cron/cleanup` | Every 6 hours | Clean expired listings, temp files, stale sessions |
| `/api/cron/analytics` | Daily 02:00 UTC | Roll up daily analytics, counter flush |
| `/api/cron/cache-warm` | Every 30 minutes | Warm frequently-accessed cache keys |

---

## 3. AWS Infrastructure

### 3.1 VPC Layout

```
┌─────────────────────────────────────────────────────────┐
│  VPC: 10.0.0.0/16                                        │
│                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐     │
│  │  Public Subnet A     │  │  Public Subnet B     │     │
│  │  10.0.1.0/24         │  │  10.0.2.0/24         │     │
│  │  (eu-central-1a)     │  │  (eu-central-1b)     │     │
│  │                      │  │                      │     │
│  │  • NAT Gateway       │  │  • NAT Gateway       │     │
│  │  • ALB (if public)   │  │                      │     │
│  └──────────────────────┘  └──────────────────────┘     │
│                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐     │
│  │  Private Subnet A    │  │  Private Subnet B    │     │
│  │  10.0.3.0/24         │  │  10.0.4.0/24         │     │
│  │  (eu-central-1a)     │  │  (eu-central-1b)     │     │
│  │                      │  │                      │     │
│  │  • ECS Tasks (WS)    │  │  • ECS Tasks (WS)    │     │
│  │  • Lambda functions   │  │  • Lambda functions   │     │
│  │  • Meilisearch EC2   │  │  • Meilisearch EC2   │     │
│  │                      │  │  • Meilisearch EC2   │     │
│  └──────────────────────┘  └──────────────────────┘     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Internal ALB: meilisearch.internal               │   │
│  │  Target Group: Meilisearch EC2 instances (7700)   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 3.2 ECS Fargate — WebSocket Server

```hcl
# infrastructure/terraform/ecs.tf

resource "aws_ecs_cluster" "platform" {
  name = "platform-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_service" "ws_server" {
  name            = "ws-server"
  cluster         = aws_ecs_cluster.platform.id
  task_definition = aws_ecs_task_definition.ws_server.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnets
    security_groups  = [aws_security_group.ws_server.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.ws_server.arn
    container_name   = "ws-server"
    container_port   = 3002
  }
}

resource "aws_ecs_task_definition" "ws_server" {
  family                   = "ws-server"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512    # 0.5 vCPU
  memory                   = 1024   # 1 GB

  container_definitions = jsonencode([{
    name  = "ws-server"
    image = "${aws_ecr_repository.ws_server.repository_url}:latest"
    portMappings = [{
      containerPort = 3002
      protocol      = "tcp"
    }]
    environment = [
      { name = "PORT", value = "3002" },
      { name = "REDIS_URL", value = var.redis_url },
      { name = "SUPABASE_URL", value = var.supabase_url },
      { name = "SUPABASE_SERVICE_ROLE_KEY", value = var.supabase_service_role_key },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/ws-server"
        "awslogs-region"        = "eu-central-1"
        "awslogs-stream-prefix" = "ws"
      }
    }
  }])
}
```

### 3.3 Lambda Functions

```hcl
# infrastructure/terraform/lambda.tf

locals {
  lambda_functions = {
    ai-worker = {
      timeout     = 300
      memory_size = 512
      reserved_concurrency = 20
      queue = aws_sqs_queue.ai_moderation_queue.arn
      batch_size = 5
    }
    search-indexer = {
      timeout     = 60
      memory_size = 256
      reserved_concurrency = 10
      queue = aws_sqs_queue.search_sync_queue.arn
      batch_size = 10
    }
    notification-worker = {
      timeout     = 30
      memory_size = 256
      reserved_concurrency = 20
      queue = aws_sqs_queue.notification_queue.arn
      batch_size = 10
    }
    media-processor = {
      timeout     = 120
      memory_size = 1024  # sharp needs more memory
      reserved_concurrency = 10
      queue = aws_sqs_queue.media_processing_queue.arn
      batch_size = 3
    }
  }
}

resource "aws_lambda_function" "workers" {
  for_each = local.lambda_functions

  function_name    = "platform-${each.key}"
  runtime          = "nodejs20.x"
  handler          = "handler.handler"
  timeout          = each.value.timeout
  memory_size      = each.value.memory_size

  reserved_concurrent_executions = each.value.reserved_concurrency

  vpc_config {
    subnet_ids         = var.private_subnets
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      DATABASE_URL   = var.database_url
      REDIS_URL      = var.redis_url
      SUPABASE_URL   = var.supabase_url
      SUPABASE_KEY   = var.supabase_service_role_key
      OPENAI_API_KEY = var.openai_api_key
      MEILISEARCH_URL = "http://${aws_lb.meilisearch.dns_name}:7700"
      MEILISEARCH_MASTER_KEY = var.meilisearch_master_key
    }
  }
}

resource "aws_lambda_event_source_mapping" "workers" {
  for_each = local.lambda_functions

  event_source_arn = each.value.queue
  function_name    = aws_lambda_function.workers[each.key].arn
  batch_size       = each.value.batch_size
  enabled          = true
}
```

### 3.4 SQS Queues

```hcl
# infrastructure/terraform/sqs.tf

locals {
  queues = {
    "ai-moderation" = {
      visibility_timeout = 300
      message_retention  = 86400
      max_receive_count  = 3
    }
    "search-sync" = {
      visibility_timeout = 60
      message_retention  = 86400
      max_receive_count  = 5
    }
    "notification" = {
      visibility_timeout = 30
      message_retention  = 86400
      max_receive_count  = 3
    }
    "media-processing" = {
      visibility_timeout = 120
      message_retention  = 86400
      max_receive_count  = 3
    }
    "email-send" = {
      visibility_timeout = 30
      message_retention  = 86400
      max_receive_count  = 5
    }
  }
}

resource "aws_sqs_queue" "queues" {
  for_each = local.queues

  name                       = "platform-${each.key}-queue"
  visibility_timeout_seconds = each.value.visibility_timeout
  message_retention_seconds  = each.value.message_retention
  receive_wait_time_seconds  = 20  # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlqs[each.key].arn
    maxReceiveCount     = each.value.max_receive_count
  })
}

resource "aws_sqs_queue" "dlqs" {
  for_each = local.queues

  name                      = "platform-${each.key}-dlq"
  message_retention_seconds = 1209600  # 14 days
}
```

### 3.5 SNS Topics

```hcl
# infrastructure/terraform/sns.tf

resource "aws_sns_topic" "content_events" {
  name = "platform-content-events"
}

resource "aws_sns_topic" "user_events" {
  name = "platform-user-events"
}

resource "aws_sns_topic" "payment_events" {
  name = "platform-payment-events"
}

# Fan-out subscriptions
resource "aws_sns_topic_subscription" "content_to_ai" {
  topic_arn = aws_sns_topic.content_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.queues["ai-moderation"].arn
}

resource "aws_sns_topic_subscription" "content_to_search" {
  topic_arn = aws_sns_topic.content_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.queues["search-sync"].arn
}

resource "aws_sns_topic_subscription" "user_to_search" {
  topic_arn = aws_sns_topic.user_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.queues["search-sync"].arn
}

resource "aws_sns_topic_subscription" "payment_to_notification" {
  topic_arn = aws_sns_topic.payment_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.queues["notification"].arn
}
```

### 3.6 Meilisearch EC2 Cluster

```hcl
# infrastructure/terraform/ec2-meilisearch.tf

resource "aws_instance" "meilisearch" {
  count         = 3
  ami           = data.aws_ami.ubuntu.id  # Ubuntu 22.04 ARM
  instance_type = "r6g.large"             # 2 vCPU, 16GB RAM

  subnet_id              = var.private_subnets[count.index % length(var.private_subnets)]
  vpc_security_group_ids = [aws_security_group.meilisearch.id]

  root_block_device {
    volume_type = "gp3"
    volume_size = 100
    iops        = 3000
    throughput  = 125
  }

  user_data = <<-EOF
    #!/bin/bash
    curl -L https://install.meilisearch.com | sh
    mv ./meilisearch /usr/local/bin/
    cat > /etc/systemd/system/meilisearch.service <<SYSTEMD
    [Unit]
    Description=Meilisearch
    After=network.target

    [Service]
    ExecStart=/usr/local/bin/meilisearch
    Environment=MEILI_ENV=production
    Environment=MEILI_MASTER_KEY=${var.meilisearch_master_key}
    Environment=MEILI_DB_PATH=/var/lib/meilisearch/data
    Environment=MEILI_HTTP_ADDR=0.0.0.0:7700
    Environment=MEILI_MAX_INDEXING_MEMORY=12GiB
    Restart=always

    [Install]
    WantedBy=multi-user.target
    SYSTEMD
    systemctl enable meilisearch
    systemctl start meilisearch
  EOF

  tags = {
    Name = "meilisearch-${count.index + 1}"
  }
}

resource "aws_lb" "meilisearch" {
  name               = "meilisearch-internal"
  internal           = true
  load_balancer_type = "application"
  subnets            = var.private_subnets
  security_groups    = [aws_security_group.meilisearch_alb.id]
}

resource "aws_lb_target_group" "meilisearch" {
  name     = "meilisearch-tg"
  port     = 7700
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path     = "/health"
    port     = 7700
    protocol = "HTTP"
  }
}
```

### 3.7 EventBridge Scheduled Rules

```hcl
# infrastructure/terraform/eventbridge.tf

resource "aws_cloudwatch_event_rule" "monthly_image_rescan" {
  name                = "monthly-image-rescan"
  schedule_expression = "rate(30 days)"
}

resource "aws_cloudwatch_event_rule" "daily_embedding_refresh" {
  name                = "daily-embedding-refresh"
  schedule_expression = "cron(0 3 * * ? *)"
}
```

---

## 4. CI/CD Pipelines (GitHub Actions)

### 4.1 CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo lint typecheck

  unit-tests:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    services:
      postgres:
        image: supabase/postgres:15.1.1.41
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test
        ports: ["5432:5432"]
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo db:generate
      - run: pnpm turbo test -- --coverage
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test

  build:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
```

### 4.2 Preview Deployment

```yaml
# .github/workflows/deploy-preview.yml
name: Preview Deploy

on:
  pull_request:
    branches: [main]

jobs:
  deploy-preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build

      # Vercel preview deploy
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}

  lighthouse:
    needs: deploy-preview
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: treosh/lighthouse-ci-action@v11
        with:
          urls: |
            ${{ needs.deploy-preview.outputs.preview-url }}
            ${{ needs.deploy-preview.outputs.preview-url }}/forums
          budgetPath: .github/lighthouse-budget.json
          uploadArtifacts: true
        # Thresholds: perf ≥ 90, a11y ≥ 95, SEO ≥ 95

  e2e:
    needs: deploy-preview
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx playwright install --with-deps
      - run: npx playwright test
        env:
          BASE_URL: ${{ needs.deploy-preview.outputs.preview-url }}
```

### 4.3 Production Deployment

```yaml
# .github/workflows/deploy-production.yml
name: Production Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: "pnpm" }
      - run: pnpm install --frozen-lockfile

      # 1. Run database migrations
      - name: Run migrations
        run: pnpm --filter @platform/db db:migrate
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      # 2. Deploy Next.js to Vercel
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: "--prod"

      # 3. Deploy workers to AWS Lambda
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-central-1

      - name: Deploy Lambda workers
        run: |
          for worker in ai-worker search-indexer notification-worker media-processor; do
            cd workers/$worker
            pnpm build
            zip -r function.zip dist/
            aws lambda update-function-code \
              --function-name platform-$worker \
              --zip-file fileb://function.zip
            cd ../..
          done

      # 4. Update ECS WebSocket server
      - name: Deploy WS server
        run: |
          aws ecs update-service \
            --cluster platform-cluster \
            --service ws-server \
            --force-new-deployment

      # 5. Smoke tests
      - name: Smoke tests
        run: |
          curl -f https://platform.co.il/api/health || exit 1
          curl -f https://platform.co.il/ || exit 1
```

---

## 5. Scaling Phases

### Phase 1: Launch (0–10K users)

**Monthly cost: ~$150–300**

| Service | Configuration | Cost/mo |
|---------|--------------|---------|
| Vercel | Pro plan | $20 |
| Supabase | Pro plan | $25 |
| Upstash Redis | Pro plan | $10 |
| AWS Lambda | Minimal usage | $5-10 |
| Meilisearch | 1× t4g.medium (4GB) | $30 |
| Domain + DNS | Cloudflare (free tier) | $0 |
| OpenAI API | ~3K/day calls | $5-10 |
| Resend | 3K emails/month | $0 (free tier) |
| **Total** | | **$95-105** + reserve |

**Simplifications:**
- No Socket.IO server (Supabase Realtime sufficient)
- Single Meilisearch node
- Minimal Lambda concurrency
- No read replica

### Phase 2: Growth (10K–50K users)

**Monthly cost: ~$800–1,500**

| Service | Configuration | Cost/mo |
|---------|--------------|---------|
| Vercel | Pro plan + bandwidth | $40-80 |
| Supabase | Pro plan + compute addon | $75-150 |
| Upstash Redis | Pro plan (larger) | $30-50 |
| AWS Lambda | Increased concurrency | $30-50 |
| AWS ECS (WS) | 2× Fargate tasks | $60-80 |
| Meilisearch | 2× r6g.large | $180-220 |
| AWS SQS/SNS | Moderate usage | $10-20 |
| OpenAI API | ~10K/day calls | $15-25 |
| Resend/SES | 50K emails/month | $20-30 |
| **Total** | | **$460-705** + reserve |

### Phase 3: Scale (50K–200K users)

**Monthly cost: ~$3,000–6,000**

| Service | Configuration | Cost/mo |
|---------|--------------|---------|
| Vercel | Enterprise | $400+ |
| Supabase | Enterprise + read replica | $300-500 |
| Upstash Redis | Enterprise | $100-200 |
| AWS Lambda | High concurrency | $100-200 |
| AWS ECS (WS) | 4× Fargate tasks | $150-200 |
| Meilisearch | 3× r6g.large | $300-350 |
| AWS networking | NAT, ALB, data transfer | $200-300 |
| OpenAI API | ~50K/day calls | $50-100 |
| SES | 500K emails/month | $50-100 |
| Monitoring | CloudWatch, PostHog | $100-200 |
| **Total** | | **$1,750-2,650** + reserve |

---

## 6. Monitoring & Alerting

| What | Tool | Alert Threshold |
|------|------|----------------|
| Application errors | Vercel Logs + Sentry | Error rate > 1% |
| API latency | Vercel Analytics | p95 > 2s |
| Database CPU | Supabase Dashboard | > 80% sustained |
| Database connections | Supabase Dashboard | > 80% pool |
| Lambda errors | CloudWatch | Any error |
| Lambda duration | CloudWatch | > 80% timeout |
| SQS DLQ messages | CloudWatch | Any message |
| SQS queue depth | CloudWatch | > 1000 messages |
| Redis memory | Upstash Dashboard | > 80% |
| Meilisearch health | Custom probe | Unhealthy |
| SSL certificate | External probe | < 30 days to expiry |
| Uptime | External probe (UptimeRobot) | Any downtime |

---

## 7. Backup & Disaster Recovery

| Data | Backup Method | RPO | RTO |
|------|-------------|-----|-----|
| PostgreSQL | Supabase PITR (Point-in-Time Recovery) | 0 (continuous) | < 1 hour |
| Supabase Storage | S3 cross-region replication | < 1 hour | < 4 hours |
| Meilisearch | Scheduled dumps to S3 (daily) | 24 hours | < 2 hours |
| Redis | Upstash daily snapshots | 24 hours | < 30 min |
| Code | GitHub (distributed) | 0 | < 5 min |

---

## 8. Environment Management

| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| Local | localhost:3000 | Docker Compose | Development |
| Preview | pr-{n}.platform.vercel.app | Supabase branch | PR review |
| Staging | staging.platform.co.il | Supabase staging project | Pre-production |
| Production | platform.co.il | Supabase production | Live |

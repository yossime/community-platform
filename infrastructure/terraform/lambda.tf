# =============================================================================
# Lambda Functions — Event-Driven Workers
# =============================================================================
# 4 Lambda functions processing messages from SQS queues:
#
#   ai-worker:           Content moderation (GPT-4o text + Vision modesty check),
#                        embedding generation (text-embedding-3-small)
#   search-indexer:      Meilisearch index sync (upsert/delete on 7 indexes)
#   notification-worker: Email (Resend), WhatsApp (Cloud API), push dispatch
#   media-processor:     Image resize (sharp), WebP conversion, BlurHash,
#                        EXIF strip, AI modesty check, multi-variant upload
#
# All functions run in private subnets with VPC config for Meilisearch access.
# Container images stored in ECR for consistent deployments.
# =============================================================================

# -----------------------------------------------------------------------------
# Lambda Function Configuration Map
# -----------------------------------------------------------------------------

locals {
  lambda_functions = {
    "ai-worker" = {
      timeout              = 300  # 5 min — AI moderation can be slow
      memory_size          = 512  # 512 MB
      reserved_concurrency = 20
      queue_key            = "ai-moderation"
      batch_size           = 5
      description          = "Content moderation via OpenAI and embedding generation"
    }
    "search-indexer" = {
      timeout              = 60   # 1 min — fast index operations
      memory_size          = 256  # 256 MB
      reserved_concurrency = 10
      queue_key            = "search-sync"
      batch_size           = 10
      description          = "Meilisearch index sync (upsert/delete)"
    }
    "notification-worker" = {
      timeout              = 30   # 30 sec — dispatch is fast
      memory_size          = 256  # 256 MB
      reserved_concurrency = 20
      queue_key            = "notification"
      batch_size           = 10
      description          = "Email, WhatsApp, and push notification dispatch"
    }
    "media-processor" = {
      timeout              = 120  # 2 min — image processing pipeline
      memory_size          = 1024 # 1 GB — sharp needs more memory
      reserved_concurrency = 10
      queue_key            = "media-processing"
      batch_size           = 3
      description          = "Image resize, WebP, BlurHash, modesty check"
    }
  }
}

# -----------------------------------------------------------------------------
# ECR Repositories — One per Lambda function
# -----------------------------------------------------------------------------

resource "aws_ecr_repository" "lambda" {
  for_each = local.lambda_functions

  name                 = "platform-${each.key}-${var.environment}"
  image_tag_mutability = "MUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name    = "platform-${each.key}-${var.environment}"
    Purpose = each.value.description
  }
}

resource "aws_ecr_lifecycle_policy" "lambda" {
  for_each = local.lambda_functions

  repository = aws_ecr_repository.lambda[each.key].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Keep only last 5 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["latest", "v"]
          countType     = "imageCountMoreThan"
          countNumber   = 5
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# CloudWatch Log Groups — One per Lambda function
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "lambda" {
  for_each = local.lambda_functions

  name              = "/aws/lambda/platform-${each.key}-${var.environment}"
  retention_in_days = 30

  tags = {
    Name    = "platform-${each.key}-logs-${var.environment}"
    Purpose = each.value.description
  }
}

# -----------------------------------------------------------------------------
# IAM Role — Lambda Execution
# -----------------------------------------------------------------------------

resource "aws_iam_role" "lambda_execution" {
  name = "platform-lambda-execution-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "platform-lambda-execution-${var.environment}"
  }
}

# Managed policy for basic Lambda execution (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Managed policy for VPC access (ENI management)
resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Custom policy for SQS, SNS, S3 access
resource "aws_iam_role_policy" "lambda_custom" {
  name = "platform-lambda-custom-policy-${var.environment}"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowSQSAccess"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = [for q in aws_sqs_queue.queues : q.arn]
      },
      {
        Sid    = "AllowSNSPublish"
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = [
          aws_sns_topic.content_events.arn,
          aws_sns_topic.user_events.arn,
          aws_sns_topic.payment_events.arn
        ]
      },
      {
        Sid    = "AllowECRPull"
        Effect = "Allow"
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Sid    = "AllowCloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [for lg in aws_cloudwatch_log_group.lambda : "${lg.arn}:*"]
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Lambda Functions
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "workers" {
  for_each = local.lambda_functions

  function_name = "platform-${each.key}-${var.environment}"
  description   = each.value.description
  role          = aws_iam_role.lambda_execution.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.lambda[each.key].repository_url}:latest"
  timeout       = each.value.timeout
  memory_size   = each.value.memory_size

  reserved_concurrent_executions = each.value.reserved_concurrency

  vpc_config {
    subnet_ids = [
      aws_subnet.private_a.id,
      aws_subnet.private_b.id
    ]
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      NODE_ENV               = var.environment
      DATABASE_URL           = var.database_url
      REDIS_URL              = var.redis_url
      SUPABASE_URL           = var.supabase_url
      SUPABASE_KEY           = var.supabase_service_role_key
      OPENAI_API_KEY         = var.openai_api_key
      MEILISEARCH_URL        = "http://${aws_lb.meilisearch.dns_name}:7700"
      MEILISEARCH_MASTER_KEY = var.meilisearch_master_key
      STRIPE_SECRET_KEY      = var.stripe_secret_key
      RESEND_API_KEY         = var.resend_api_key
    }
  }

  # Ensure log group is created before the function
  depends_on = [aws_cloudwatch_log_group.lambda]

  tags = {
    Name    = "platform-${each.key}-${var.environment}"
    Purpose = each.value.description
  }
}

# -----------------------------------------------------------------------------
# Event Source Mappings — SQS → Lambda
# -----------------------------------------------------------------------------

resource "aws_lambda_event_source_mapping" "workers" {
  for_each = local.lambda_functions

  event_source_arn                   = aws_sqs_queue.queues[each.value.queue_key].arn
  function_name                      = aws_lambda_function.workers[each.key].arn
  batch_size                         = each.value.batch_size
  maximum_batching_window_in_seconds = 5 # Wait up to 5s to fill batch
  enabled                            = true

  # Scale down to zero when queue is empty
  scaling_config {
    maximum_concurrency = each.value.reserved_concurrency
  }
}

# -----------------------------------------------------------------------------
# CloudWatch Alarms — Lambda Errors
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = local.lambda_functions

  alarm_name          = "platform-${each.key}-errors-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300 # 5 minutes
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Lambda ${each.key} has errors in ${var.environment}"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.workers[each.key].function_name
  }

  tags = {
    Name = "platform-${each.key}-error-alarm-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# CloudWatch Alarms — Lambda Duration (approaching timeout)
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "lambda_duration" {
  for_each = local.lambda_functions

  alarm_name          = "platform-${each.key}-duration-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300 # 5 minutes
  statistic           = "Maximum"
  threshold           = each.value.timeout * 1000 * 0.8 # 80% of timeout in ms
  alarm_description   = "Lambda ${each.key} approaching timeout in ${var.environment}"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.workers[each.key].function_name
  }

  tags = {
    Name = "platform-${each.key}-duration-alarm-${var.environment}"
  }
}

# =============================================================================
# SQS Queues + Dead Letter Queues
# =============================================================================
# 5 queues for the event-driven worker pipeline:
#   - ai-moderation:    Content moderation via OpenAI (GPT-4o Vision + text)
#   - search-sync:      Meilisearch index upserts/deletes
#   - notification:     Email, WhatsApp, push notification dispatch
#   - media-processing: Image resize, WebP conversion, BlurHash, modesty check
#   - email-send:       Dedicated email queue for bulk and transactional
#
# Each queue has a corresponding DLQ with 14-day retention for debugging.
# Long polling (20s) is enabled on all queues to reduce SQS costs.
# =============================================================================

locals {
  queues = {
    "ai-moderation" = {
      visibility_timeout = 300   # 5 min — AI moderation can be slow
      message_retention  = 86400 # 1 day
      max_receive_count  = 3
    }
    "search-sync" = {
      visibility_timeout = 60    # 1 min — fast index operations
      message_retention  = 86400 # 1 day
      max_receive_count  = 5
    }
    "notification" = {
      visibility_timeout = 30    # 30 sec — quick dispatch
      message_retention  = 86400 # 1 day
      max_receive_count  = 3
    }
    "media-processing" = {
      visibility_timeout = 120   # 2 min — image processing pipeline
      message_retention  = 86400 # 1 day
      max_receive_count  = 3
    }
    "email-send" = {
      visibility_timeout = 30    # 30 sec — email send is fast
      message_retention  = 86400 # 1 day
      max_receive_count  = 5
    }
  }
}

# -----------------------------------------------------------------------------
# Dead Letter Queues
# -----------------------------------------------------------------------------

resource "aws_sqs_queue" "dlqs" {
  for_each = local.queues

  name                      = "platform-${each.key}-dlq-${var.environment}"
  message_retention_seconds = 1209600 # 14 days — enough time for investigation

  tags = {
    Name    = "platform-${each.key}-dlq-${var.environment}"
    Purpose = "Dead letter queue for platform-${each.key}"
  }
}

# -----------------------------------------------------------------------------
# Primary Queues
# -----------------------------------------------------------------------------

resource "aws_sqs_queue" "queues" {
  for_each = local.queues

  name                       = "platform-${each.key}-queue-${var.environment}"
  visibility_timeout_seconds = each.value.visibility_timeout
  message_retention_seconds  = each.value.message_retention
  receive_wait_time_seconds  = 20 # Long polling to reduce empty receives

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlqs[each.key].arn
    maxReceiveCount     = each.value.max_receive_count
  })

  tags = {
    Name    = "platform-${each.key}-queue-${var.environment}"
    Purpose = each.key
  }
}

# -----------------------------------------------------------------------------
# SQS Policies — Allow SNS topics to send messages to queues
# -----------------------------------------------------------------------------

# ai-moderation queue receives from content-events topic
resource "aws_sqs_queue_policy" "ai_moderation" {
  queue_url = aws_sqs_queue.queues["ai-moderation"].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSNSContentEvents"
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.queues["ai-moderation"].arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.content_events.arn
          }
        }
      }
    ]
  })
}

# search-sync queue receives from content-events and user-events topics
resource "aws_sqs_queue_policy" "search_sync" {
  queue_url = aws_sqs_queue.queues["search-sync"].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSNSContentAndUserEvents"
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.queues["search-sync"].arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = [
              aws_sns_topic.content_events.arn,
              aws_sns_topic.user_events.arn
            ]
          }
        }
      }
    ]
  })
}

# notification queue receives from content-events, user-events, and payment-events topics
resource "aws_sqs_queue_policy" "notification" {
  queue_url = aws_sqs_queue.queues["notification"].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSNSAllEvents"
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.queues["notification"].arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = [
              aws_sns_topic.content_events.arn,
              aws_sns_topic.user_events.arn,
              aws_sns_topic.payment_events.arn
            ]
          }
        }
      }
    ]
  })
}

# media-processing queue receives from content-events topic
resource "aws_sqs_queue_policy" "media_processing" {
  queue_url = aws_sqs_queue.queues["media-processing"].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSNSContentEvents"
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.queues["media-processing"].arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.content_events.arn
          }
        }
      }
    ]
  })
}

# email-send queue receives from user-events and payment-events topics
resource "aws_sqs_queue_policy" "email_send" {
  queue_url = aws_sqs_queue.queues["email-send"].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSNSUserAndPaymentEvents"
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.queues["email-send"].arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = [
              aws_sns_topic.user_events.arn,
              aws_sns_topic.payment_events.arn
            ]
          }
        }
      }
    ]
  })
}

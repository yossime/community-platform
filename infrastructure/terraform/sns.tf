# =============================================================================
# SNS Topics + Fan-out Subscriptions
# =============================================================================
# 3 event topics implementing the fan-out pattern:
#
#   content-events → ai-moderation, search-sync, notification, media-processing
#   user-events    → search-sync, notification, email-send
#   payment-events → notification, email-send
#
# Content creation flow:
#   Client → tRPC → Prisma INSERT → SNS publish (content-events) →
#     → SQS: ai-moderation → Lambda: AI check → Prisma UPDATE status
#     → SQS: search-sync   → Lambda: Meilisearch upsert
#     → SQS: notification  → Lambda: notify subscribers
#     → SQS: media-processing → Lambda: image pipeline
# =============================================================================

# -----------------------------------------------------------------------------
# Topics
# -----------------------------------------------------------------------------

resource "aws_sns_topic" "content_events" {
  name = "platform-content-events-${var.environment}"

  tags = {
    Name    = "platform-content-events-${var.environment}"
    Purpose = "Content creation, update, deletion events"
  }
}

resource "aws_sns_topic" "user_events" {
  name = "platform-user-events-${var.environment}"

  tags = {
    Name    = "platform-user-events-${var.environment}"
    Purpose = "User registration, profile updates, membership changes"
  }
}

resource "aws_sns_topic" "payment_events" {
  name = "platform-payment-events-${var.environment}"

  tags = {
    Name    = "platform-payment-events-${var.environment}"
    Purpose = "Stripe payments, escrow, subscription events"
  }
}

# -----------------------------------------------------------------------------
# Subscriptions — content-events fan-out
# -----------------------------------------------------------------------------

# Content → AI moderation (text + image modesty check)
resource "aws_sns_topic_subscription" "content_to_ai_moderation" {
  topic_arn = aws_sns_topic.content_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.queues["ai-moderation"].arn

  raw_message_delivery = true
}

# Content → Search indexing (Meilisearch upsert)
resource "aws_sns_topic_subscription" "content_to_search_sync" {
  topic_arn = aws_sns_topic.content_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.queues["search-sync"].arn

  raw_message_delivery = true
}

# Content → Notification dispatch (notify subscribers)
resource "aws_sns_topic_subscription" "content_to_notification" {
  topic_arn = aws_sns_topic.content_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.queues["notification"].arn

  raw_message_delivery = true

  # Only forward events that require notification (filter by message attribute)
  filter_policy = jsonencode({
    eventType = ["thread.created", "post.created", "article.published", "course.published"]
  })
}

# Content → Media processing (image resize, WebP, BlurHash, modesty)
resource "aws_sns_topic_subscription" "content_to_media_processing" {
  topic_arn = aws_sns_topic.content_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.queues["media-processing"].arn

  raw_message_delivery = true

  # Only forward events that include media attachments
  filter_policy = jsonencode({
    hasMedia = ["true"]
  })
}

# -----------------------------------------------------------------------------
# Subscriptions — user-events fan-out
# -----------------------------------------------------------------------------

# User → Search indexing (update user/freelancer profile in Meilisearch)
resource "aws_sns_topic_subscription" "user_to_search_sync" {
  topic_arn = aws_sns_topic.user_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.queues["search-sync"].arn

  raw_message_delivery = true
}

# User → Notification (welcome email, profile reminders)
resource "aws_sns_topic_subscription" "user_to_notification" {
  topic_arn = aws_sns_topic.user_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.queues["notification"].arn

  raw_message_delivery = true
}

# User → Email (welcome, verification, password reset)
resource "aws_sns_topic_subscription" "user_to_email" {
  topic_arn = aws_sns_topic.user_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.queues["email-send"].arn

  raw_message_delivery = true

  # Only forward email-triggering events
  filter_policy = jsonencode({
    eventType = ["user.registered", "user.verified", "user.password_reset"]
  })
}

# -----------------------------------------------------------------------------
# Subscriptions — payment-events fan-out
# -----------------------------------------------------------------------------

# Payment → Notification (payment received, escrow released, subscription changed)
resource "aws_sns_topic_subscription" "payment_to_notification" {
  topic_arn = aws_sns_topic.payment_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.queues["notification"].arn

  raw_message_delivery = true
}

# Payment → Email (receipts, invoices, payment confirmations)
resource "aws_sns_topic_subscription" "payment_to_email" {
  topic_arn = aws_sns_topic.payment_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.queues["email-send"].arn

  raw_message_delivery = true
}

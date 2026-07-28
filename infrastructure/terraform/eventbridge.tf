# =============================================================================
# EventBridge Scheduled Rules
# =============================================================================
# Scheduled tasks that trigger Lambda functions on a recurring basis:
#
#   1. Monthly image rescan — Re-run AI modesty checks on all stored images
#      to catch policy updates and improve accuracy over time.
#
#   2. Daily embedding refresh — Regenerate search embeddings at 3am UTC
#      to incorporate new content and refresh stale vectors.
# =============================================================================

# -----------------------------------------------------------------------------
# Monthly Image Rescan (every 30 days)
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "monthly_image_rescan" {
  name                = "platform-monthly-image-rescan-${var.environment}"
  description         = "Re-scan all stored images with AI modesty check every 30 days"
  schedule_expression = "rate(30 days)"
  state               = "ENABLED"

  tags = {
    Name    = "platform-monthly-image-rescan-${var.environment}"
    Purpose = "Periodic AI modesty re-evaluation of all uploaded images"
  }
}

resource "aws_cloudwatch_event_target" "monthly_image_rescan" {
  rule      = aws_cloudwatch_event_rule.monthly_image_rescan.name
  target_id = "media-processor-lambda"
  arn       = aws_lambda_function.workers["media-processor"].arn

  input = jsonencode({
    source    = "eventbridge"
    action    = "rescan-all-images"
    scheduled = true
  })
}

resource "aws_lambda_permission" "monthly_image_rescan" {
  statement_id  = "AllowEventBridgeMonthlyImageRescan"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.workers["media-processor"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.monthly_image_rescan.arn
}

# -----------------------------------------------------------------------------
# Daily Embedding Refresh (3am UTC)
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "daily_embedding_refresh" {
  name                = "platform-daily-embedding-refresh-${var.environment}"
  description         = "Refresh search embeddings daily at 3am UTC"
  schedule_expression = "cron(0 3 * * ? *)"
  state               = "ENABLED"

  tags = {
    Name    = "platform-daily-embedding-refresh-${var.environment}"
    Purpose = "Regenerate text-embedding-3-small vectors for semantic search"
  }
}

resource "aws_cloudwatch_event_target" "daily_embedding_refresh" {
  rule      = aws_cloudwatch_event_rule.daily_embedding_refresh.name
  target_id = "ai-worker-lambda"
  arn       = aws_lambda_function.workers["ai-worker"].arn

  input = jsonencode({
    source    = "eventbridge"
    action    = "refresh-embeddings"
    scheduled = true
  })
}

resource "aws_lambda_permission" "daily_embedding_refresh" {
  statement_id  = "AllowEventBridgeDailyEmbeddingRefresh"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.workers["ai-worker"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_embedding_refresh.arn
}

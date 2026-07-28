# =============================================================================
# Outputs
# =============================================================================
# Key infrastructure values needed by other systems:
#   - CI/CD pipelines (ECR URLs, Lambda ARNs)
#   - Application configuration (ALB DNS names, SQS queue URLs)
#   - Monitoring dashboards (resource IDs)
# =============================================================================

# -----------------------------------------------------------------------------
# VPC & Networking
# -----------------------------------------------------------------------------

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs (ALBs, NAT gateways)"
  value = [
    aws_subnet.public_a.id,
    aws_subnet.public_b.id
  ]
}

output "private_subnet_ids" {
  description = "Private subnet IDs (ECS, Lambda, Meilisearch)"
  value = [
    aws_subnet.private_a.id,
    aws_subnet.private_b.id
  ]
}

# -----------------------------------------------------------------------------
# ALB DNS Names
# -----------------------------------------------------------------------------

output "ws_server_alb_dns" {
  description = "WebSocket server ALB DNS name (public-facing)"
  value       = aws_lb.ws_server.dns_name
}

output "meilisearch_alb_dns" {
  description = "Meilisearch internal ALB DNS name (VPC-only)"
  value       = aws_lb.meilisearch.dns_name
}

output "meilisearch_url" {
  description = "Meilisearch URL (for application config)"
  value       = "http://${aws_lb.meilisearch.dns_name}:7700"
}

# -----------------------------------------------------------------------------
# ECS
# -----------------------------------------------------------------------------

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.platform.name
}

output "ecs_service_name" {
  description = "ECS WebSocket service name"
  value       = aws_ecs_service.ws_server.name
}

# -----------------------------------------------------------------------------
# ECR Repository URLs
# -----------------------------------------------------------------------------

output "ecr_ws_server_url" {
  description = "ECR repository URL for ws-server"
  value       = aws_ecr_repository.ws_server.repository_url
}

output "ecr_lambda_urls" {
  description = "ECR repository URLs for Lambda functions"
  value       = { for k, v in aws_ecr_repository.lambda : k => v.repository_url }
}

# -----------------------------------------------------------------------------
# Lambda ARNs
# -----------------------------------------------------------------------------

output "lambda_arns" {
  description = "Lambda function ARNs"
  value       = { for k, v in aws_lambda_function.workers : k => v.arn }
}

output "lambda_function_names" {
  description = "Lambda function names (for CI/CD deployments)"
  value       = { for k, v in aws_lambda_function.workers : k => v.function_name }
}

# -----------------------------------------------------------------------------
# SQS Queue URLs
# -----------------------------------------------------------------------------

output "sqs_queue_urls" {
  description = "SQS queue URLs (for application message publishing)"
  value       = { for k, v in aws_sqs_queue.queues : k => v.url }
}

output "sqs_queue_arns" {
  description = "SQS queue ARNs"
  value       = { for k, v in aws_sqs_queue.queues : k => v.arn }
}

output "sqs_dlq_urls" {
  description = "SQS dead letter queue URLs (for monitoring/debugging)"
  value       = { for k, v in aws_sqs_queue.dlqs : k => v.url }
}

# -----------------------------------------------------------------------------
# SNS Topic ARNs
# -----------------------------------------------------------------------------

output "sns_content_events_arn" {
  description = "SNS content-events topic ARN"
  value       = aws_sns_topic.content_events.arn
}

output "sns_user_events_arn" {
  description = "SNS user-events topic ARN"
  value       = aws_sns_topic.user_events.arn
}

output "sns_payment_events_arn" {
  description = "SNS payment-events topic ARN"
  value       = aws_sns_topic.payment_events.arn
}

output "sns_topic_arns" {
  description = "All SNS topic ARNs"
  value = {
    content_events = aws_sns_topic.content_events.arn
    user_events    = aws_sns_topic.user_events.arn
    payment_events = aws_sns_topic.payment_events.arn
  }
}

# -----------------------------------------------------------------------------
# Meilisearch
# -----------------------------------------------------------------------------

output "meilisearch_instance_ids" {
  description = "Meilisearch EC2 instance IDs"
  value       = [for i in aws_instance.meilisearch : i.id]
}

output "meilisearch_private_ips" {
  description = "Meilisearch EC2 private IP addresses"
  value       = [for i in aws_instance.meilisearch : i.private_ip]
}

# -----------------------------------------------------------------------------
# Security Groups
# -----------------------------------------------------------------------------

output "security_group_ids" {
  description = "Security group IDs"
  value = {
    ws_server       = aws_security_group.ws_server.id
    ws_alb          = aws_security_group.ws_alb.id
    lambda          = aws_security_group.lambda.id
    meilisearch     = aws_security_group.meilisearch.id
    meilisearch_alb = aws_security_group.meilisearch_alb.id
  }
}

# -----------------------------------------------------------------------------
# AWS Account Info
# -----------------------------------------------------------------------------

output "aws_account_id" {
  description = "AWS account ID"
  value       = data.aws_caller_identity.current.account_id
}

output "aws_region" {
  description = "AWS region"
  value       = var.region
}

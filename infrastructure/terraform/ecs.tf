# =============================================================================
# ECS Fargate — WebSocket Server (Socket.IO)
# =============================================================================
# The WebSocket server runs on ECS Fargate behind a public-facing ALB.
# It handles ephemeral real-time events: typing indicators, online presence,
# marketplace live chat, and read receipts.
#
# Supabase Realtime handles DB-change notifications, broadcast, and presence
# for threads, messages, and notifications. Socket.IO complements it for
# low-latency ephemeral events.
#
# Architecture: ALB (public) → ECS Fargate (private subnets) → 2 tasks
# =============================================================================

# -----------------------------------------------------------------------------
# ECR Repository — ws-server Docker image
# -----------------------------------------------------------------------------

resource "aws_ecr_repository" "ws_server" {
  name                 = "platform-ws-server-${var.environment}"
  image_tag_mutability = "MUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name = "platform-ws-server-${var.environment}"
  }
}

# ECR lifecycle policy — keep last 10 images, expire untagged after 7 days
resource "aws_ecr_lifecycle_policy" "ws_server" {
  repository = aws_ecr_repository.ws_server.name

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
        description  = "Keep only last 10 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["latest", "v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# ECS Cluster
# -----------------------------------------------------------------------------

resource "aws_ecs_cluster" "platform" {
  name = "platform-cluster-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "platform-cluster-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# CloudWatch Log Group — ECS ws-server
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "ws_server" {
  name              = "/ecs/ws-server-${var.environment}"
  retention_in_days = 30

  tags = {
    Name = "platform-ws-server-logs-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# ECS Task Execution Role (ECR pull, CloudWatch logs)
# -----------------------------------------------------------------------------

resource "aws_iam_role" "ecs_task_execution" {
  name = "platform-ecs-task-execution-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "platform-ecs-task-execution-${var.environment}"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# -----------------------------------------------------------------------------
# ECS Task Role (permissions the container needs at runtime)
# -----------------------------------------------------------------------------

resource "aws_iam_role" "ecs_task" {
  name = "platform-ecs-task-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "platform-ecs-task-${var.environment}"
  }
}

# The WS server needs to publish to SNS topics for real-time event propagation
resource "aws_iam_role_policy" "ecs_task" {
  name = "platform-ecs-task-policy-${var.environment}"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
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
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# ECS Task Definition
# -----------------------------------------------------------------------------

resource "aws_ecs_task_definition" "ws_server" {
  family                   = "platform-ws-server-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512  # 0.5 vCPU
  memory                   = 1024 # 1 GB
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "ws-server"
      image     = "${aws_ecr_repository.ws_server.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = 3002
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "PORT", value = "3002" },
        { name = "NODE_ENV", value = var.environment },
        { name = "REDIS_URL", value = var.redis_url },
        { name = "SUPABASE_URL", value = var.supabase_url },
        { name = "SUPABASE_SERVICE_ROLE_KEY", value = var.supabase_service_role_key },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ws_server.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "ws"
        }
      }

      # Health check at the container level
      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --spider http://localhost:3002/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name = "platform-ws-server-task-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# ECS Service
# -----------------------------------------------------------------------------

resource "aws_ecs_service" "ws_server" {
  name            = "ws-server-${var.environment}"
  cluster         = aws_ecs_cluster.platform.id
  task_definition = aws_ecs_task_definition.ws_server.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  # Ensure minimum healthy percentage during deployments
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  network_configuration {
    subnets = [
      aws_subnet.private_a.id,
      aws_subnet.private_b.id
    ]
    security_groups  = [aws_security_group.ws_server.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.ws_server.arn
    container_name   = "ws-server"
    container_port   = 3002
  }

  # Ignore desired_count changes from autoscaling
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener.ws_server]

  tags = {
    Name = "platform-ws-server-service-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Application Load Balancer — WebSocket (public-facing)
# -----------------------------------------------------------------------------

resource "aws_lb" "ws_server" {
  name               = "platform-ws-alb-${var.environment}"
  internal           = false
  load_balancer_type = "application"

  subnets = [
    aws_subnet.public_a.id,
    aws_subnet.public_b.id
  ]

  security_groups = [aws_security_group.ws_alb.id]

  # Enable HTTP/2 for better WebSocket upgrade performance
  enable_http2 = true

  # Increase idle timeout for WebSocket connections (default 60s is too short)
  idle_timeout = 3600 # 1 hour

  tags = {
    Name = "platform-ws-alb-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Target Group — WebSocket server
# -----------------------------------------------------------------------------

resource "aws_lb_target_group" "ws_server" {
  name        = "platform-ws-tg-${var.environment}"
  port        = 3002
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip" # Required for Fargate

  # Stickiness for WebSocket connections (Socket.IO long-polling fallback)
  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400 # 1 day
    enabled         = true
  }

  health_check {
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  tags = {
    Name = "platform-ws-tg-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# ALB Listener — HTTP (port 80, redirects to HTTPS)
# -----------------------------------------------------------------------------

resource "aws_lb_listener" "ws_server_http" {
  load_balancer_arn = aws_lb.ws_server.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = {
    Name = "platform-ws-http-listener-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# ALB Listener — HTTPS (port 443, forwards to target group)
# Note: Certificate ARN must be provided. Use ACM to create and validate.
# For initial setup without a certificate, use the HTTP listener directly.
# -----------------------------------------------------------------------------

resource "aws_lb_listener" "ws_server" {
  load_balancer_arn = aws_lb.ws_server.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.ws_server.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.ws_server.arn
  }

  tags = {
    Name = "platform-ws-https-listener-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# ACM Certificate for WebSocket subdomain
# -----------------------------------------------------------------------------

resource "aws_acm_certificate" "ws_server" {
  domain_name       = "ws.${var.domain_name}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "platform-ws-cert-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Auto Scaling — ECS Service (scale on CPU/connections)
# -----------------------------------------------------------------------------

resource "aws_appautoscaling_target" "ws_server" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.platform.name}/${aws_ecs_service.ws_server.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ws_server_cpu" {
  name               = "platform-ws-cpu-scaling-${var.environment}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ws_server.resource_id
  scalable_dimension = aws_appautoscaling_target.ws_server.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ws_server.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# -----------------------------------------------------------------------------
# ACM Certificate DNS Validation
# -----------------------------------------------------------------------------

data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}

resource "aws_route53_record" "ws_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.ws_server.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main.zone_id
}

resource "aws_acm_certificate_validation" "ws_server" {
  certificate_arn         = aws_acm_certificate.ws_server.arn
  validation_record_fqdns = [for record in aws_route53_record.ws_cert_validation : record.fqdn]
}

# Route53 A record for ws ALB
resource "aws_route53_record" "ws_server" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "ws.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.ws_server.dns_name
    zone_id                = aws_lb.ws_server.zone_id
    evaluate_target_health = true
  }
}

# -----------------------------------------------------------------------------
# Auto Scaling — ECS Service (scale on CPU/connections)
# -----------------------------------------------------------------------------

resource "aws_appautoscaling_policy" "ws_server_memory" {
  name               = "platform-ws-memory-scaling-${var.environment}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ws_server.resource_id
  scalable_dimension = aws_appautoscaling_target.ws_server.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ws_server.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

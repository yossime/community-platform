# =============================================================================
# Meilisearch EC2 Cluster (3 Nodes)
# =============================================================================
# 3-node Meilisearch cluster running on r6g.large (ARM) instances with
# 100GB gp3 volumes. Deployed across 2 AZs behind an internal ALB.
#
# Meilisearch provides full-text search across 7 indexes:
#   threads, posts, users, projects, classifieds, portfolios, articles
#
# The internal ALB ensures Lambda functions and ECS tasks can reach
# Meilisearch without exposing it to the internet.
#
# Note: Meilisearch does not natively support clustering/replication.
# The 3-node setup provides redundancy — writes go to primary,
# reads are load-balanced. Sync between nodes is handled by the
# search-indexer Lambda writing to all nodes.
# =============================================================================

# -----------------------------------------------------------------------------
# AMI — Ubuntu 22.04 ARM64
# -----------------------------------------------------------------------------

data "aws_ami" "ubuntu_arm" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-arm64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

# -----------------------------------------------------------------------------
# SSH Key Pair (for maintenance access)
# -----------------------------------------------------------------------------

resource "aws_key_pair" "meilisearch" {
  key_name   = "platform-meilisearch-${var.environment}"
  public_key = file("${path.module}/keys/meilisearch.pub")

  tags = {
    Name = "platform-meilisearch-key-${var.environment}"
  }

  lifecycle {
    # Key pair can be created manually; ignore if file doesn't exist
    precondition {
      condition     = fileexists("${path.module}/keys/meilisearch.pub")
      error_message = "SSH public key not found at keys/meilisearch.pub. Generate with: ssh-keygen -t ed25519 -f keys/meilisearch"
    }
  }
}

# -----------------------------------------------------------------------------
# EC2 Instances — Meilisearch Nodes
# -----------------------------------------------------------------------------

resource "aws_instance" "meilisearch" {
  count = 3

  ami           = data.aws_ami.ubuntu_arm.id
  instance_type = "r6g.large" # 2 vCPU, 16 GB RAM — optimized for search workloads
  key_name      = aws_key_pair.meilisearch.key_name

  # Distribute across private subnets (2 AZs: nodes 0,2 in AZ-a, node 1 in AZ-b)
  subnet_id = count.index % 2 == 0 ? aws_subnet.private_a.id : aws_subnet.private_b.id

  vpc_security_group_ids = [aws_security_group.meilisearch.id]

  # gp3 root volume: 100 GB, 3000 IOPS, 125 MB/s throughput
  root_block_device {
    volume_type           = "gp3"
    volume_size           = 100
    iops                  = 3000
    throughput            = 125
    encrypted             = true
    delete_on_termination = false # Preserve data on instance termination

    tags = {
      Name = "platform-meilisearch-vol-${count.index + 1}-${var.environment}"
    }
  }

  # Detailed monitoring for CloudWatch metrics (1-minute granularity)
  monitoring = true

  # User data script: install and configure Meilisearch as a systemd service
  user_data = base64encode(templatefile("${path.module}/templates/meilisearch-userdata.sh.tpl", {
    meilisearch_master_key = var.meilisearch_master_key
    node_index             = count.index + 1
    environment            = var.environment
  }))

  tags = {
    Name     = "platform-meilisearch-${count.index + 1}-${var.environment}"
    Role     = "meilisearch"
    NodeIndex = count.index + 1
  }
}

# -----------------------------------------------------------------------------
# Internal Application Load Balancer — Meilisearch
# -----------------------------------------------------------------------------

resource "aws_lb" "meilisearch" {
  name               = "platform-ms-alb-${var.environment}"
  internal           = true
  load_balancer_type = "application"

  subnets = [
    aws_subnet.private_a.id,
    aws_subnet.private_b.id
  ]

  security_groups = [aws_security_group.meilisearch_alb.id]

  tags = {
    Name = "platform-meilisearch-alb-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Target Group — Meilisearch (port 7700)
# -----------------------------------------------------------------------------

resource "aws_lb_target_group" "meilisearch" {
  name     = "platform-ms-tg-${var.environment}"
  port     = 7700
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    path                = "/health"
    port                = "7700"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  tags = {
    Name = "platform-meilisearch-tg-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Target Group Attachments — Register all 3 Meilisearch instances
# -----------------------------------------------------------------------------

resource "aws_lb_target_group_attachment" "meilisearch" {
  count = 3

  target_group_arn = aws_lb_target_group.meilisearch.arn
  target_id        = aws_instance.meilisearch[count.index].id
  port             = 7700
}

# -----------------------------------------------------------------------------
# ALB Listener — HTTP on port 7700 (internal only, no TLS needed)
# -----------------------------------------------------------------------------

resource "aws_lb_listener" "meilisearch" {
  load_balancer_arn = aws_lb.meilisearch.arn
  port              = 7700
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.meilisearch.arn
  }

  tags = {
    Name = "platform-meilisearch-listener-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# CloudWatch Alarms — Meilisearch Health
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "meilisearch_unhealthy" {
  alarm_name          = "platform-meilisearch-unhealthy-${var.environment}"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Minimum"
  threshold           = 2 # Alert if fewer than 2 healthy nodes
  alarm_description   = "Meilisearch cluster has fewer than 2 healthy nodes"
  treat_missing_data  = "breaching"

  dimensions = {
    TargetGroup  = aws_lb_target_group.meilisearch.arn_suffix
    LoadBalancer = aws_lb.meilisearch.arn_suffix
  }

  tags = {
    Name = "platform-meilisearch-health-alarm-${var.environment}"
  }
}

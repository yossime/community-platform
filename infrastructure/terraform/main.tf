# =============================================================================
# Main — Provider, VPC, Subnets, Gateways, Route Tables, Security Groups
# =============================================================================
# All AWS resources are deployed to eu-central-1 (Frankfurt) to minimize
# latency to Israel and colocate with Supabase and Upstash Redis.
# =============================================================================

# -----------------------------------------------------------------------------
# Provider
# -----------------------------------------------------------------------------

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = local.common_tags
  }
}

# -----------------------------------------------------------------------------
# Data Sources
# -----------------------------------------------------------------------------

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# -----------------------------------------------------------------------------
# VPC
# -----------------------------------------------------------------------------

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "platform-vpc-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Internet Gateway
# -----------------------------------------------------------------------------

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "platform-igw-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Public Subnets (2 AZs)
# -----------------------------------------------------------------------------

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.region}a"
  map_public_ip_on_launch = true

  tags = {
    Name = "platform-public-a-${var.environment}"
    Tier = "public"
  }
}

resource "aws_subnet" "public_b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = "${var.region}b"
  map_public_ip_on_launch = true

  tags = {
    Name = "platform-public-b-${var.environment}"
    Tier = "public"
  }
}

# -----------------------------------------------------------------------------
# Private Subnets (2 AZs)
# -----------------------------------------------------------------------------

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.3.0/24"
  availability_zone = "${var.region}a"

  tags = {
    Name = "platform-private-a-${var.environment}"
    Tier = "private"
  }
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.4.0/24"
  availability_zone = "${var.region}b"

  tags = {
    Name = "platform-private-b-${var.environment}"
    Tier = "private"
  }
}

# -----------------------------------------------------------------------------
# Elastic IPs for NAT Gateways
# -----------------------------------------------------------------------------

resource "aws_eip" "nat_a" {
  domain = "vpc"

  tags = {
    Name = "platform-nat-eip-a-${var.environment}"
  }
}

resource "aws_eip" "nat_b" {
  domain = "vpc"

  tags = {
    Name = "platform-nat-eip-b-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# NAT Gateways (one per AZ for high availability)
# -----------------------------------------------------------------------------

resource "aws_nat_gateway" "a" {
  allocation_id = aws_eip.nat_a.id
  subnet_id     = aws_subnet.public_a.id

  tags = {
    Name = "platform-nat-a-${var.environment}"
  }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "b" {
  allocation_id = aws_eip.nat_b.id
  subnet_id     = aws_subnet.public_b.id

  tags = {
    Name = "platform-nat-b-${var.environment}"
  }

  depends_on = [aws_internet_gateway.main]
}

# -----------------------------------------------------------------------------
# Route Tables — Public
# -----------------------------------------------------------------------------

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "platform-rt-public-${var.environment}"
  }
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_b" {
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public.id
}

# -----------------------------------------------------------------------------
# Route Tables — Private (one per AZ, routes through respective NAT)
# -----------------------------------------------------------------------------

resource "aws_route_table" "private_a" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.a.id
  }

  tags = {
    Name = "platform-rt-private-a-${var.environment}"
  }
}

resource "aws_route_table" "private_b" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.b.id
  }

  tags = {
    Name = "platform-rt-private-b-${var.environment}"
  }
}

resource "aws_route_table_association" "private_a" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private_a.id
}

resource "aws_route_table_association" "private_b" {
  subnet_id      = aws_subnet.private_b.id
  route_table_id = aws_route_table.private_b.id
}

# -----------------------------------------------------------------------------
# Security Group — WebSocket Server (ECS Fargate)
# -----------------------------------------------------------------------------

resource "aws_security_group" "ws_server" {
  name        = "platform-ws-server-${var.environment}"
  description = "Allow inbound WebSocket traffic from ALB and outbound to internet"
  vpc_id      = aws_vpc.main.id

  # Allow inbound from the WS ALB on port 3002
  ingress {
    description     = "WebSocket from ALB"
    from_port       = 3002
    to_port         = 3002
    protocol        = "tcp"
    security_groups = [aws_security_group.ws_alb.id]
  }

  # Allow all outbound (Redis, Supabase, external APIs)
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "platform-sg-ws-server-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Security Group — WebSocket ALB (public-facing)
# -----------------------------------------------------------------------------

resource "aws_security_group" "ws_alb" {
  name        = "platform-ws-alb-${var.environment}"
  description = "Allow inbound HTTPS/WSS from internet to WebSocket ALB"
  vpc_id      = aws_vpc.main.id

  # HTTPS/WSS from internet
  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTP redirect
  ingress {
    description = "HTTP from internet (redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Outbound to ECS tasks
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "platform-sg-ws-alb-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Security Group — Lambda Functions
# -----------------------------------------------------------------------------

resource "aws_security_group" "lambda" {
  name        = "platform-lambda-${var.environment}"
  description = "Lambda functions — outbound to Supabase, Redis, Meilisearch, OpenAI"
  vpc_id      = aws_vpc.main.id

  # Lambda needs no inbound rules (invoked by SQS/EventBridge)

  # Outbound to all (external APIs, Supabase, Redis, Meilisearch)
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "platform-sg-lambda-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Security Group — Meilisearch EC2 Instances
# -----------------------------------------------------------------------------

resource "aws_security_group" "meilisearch" {
  name        = "platform-meilisearch-${var.environment}"
  description = "Meilisearch instances — accept traffic from internal ALB only"
  vpc_id      = aws_vpc.main.id

  # Allow inbound from the internal Meilisearch ALB on port 7700
  ingress {
    description     = "Meilisearch from internal ALB"
    from_port       = 7700
    to_port         = 7700
    protocol        = "tcp"
    security_groups = [aws_security_group.meilisearch_alb.id]
  }

  # Allow SSH for maintenance (optional, restrict to bastion/VPN in production)
  ingress {
    description = "SSH from VPC"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  # Outbound for package updates and Meilisearch downloads
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "platform-sg-meilisearch-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Security Group — Meilisearch Internal ALB
# -----------------------------------------------------------------------------

resource "aws_security_group" "meilisearch_alb" {
  name        = "platform-meilisearch-alb-${var.environment}"
  description = "Internal ALB for Meilisearch — accept from Lambda, ECS, VPC"
  vpc_id      = aws_vpc.main.id

  # Allow inbound from VPC on port 7700 (Lambda, ECS tasks)
  ingress {
    description = "Meilisearch from VPC"
    from_port   = 7700
    to_port     = 7700
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  # Also allow HTTP on port 80 for ALB listener
  ingress {
    description = "HTTP from VPC"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  # Outbound to Meilisearch instances
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "platform-sg-meilisearch-alb-${var.environment}"
  }
}

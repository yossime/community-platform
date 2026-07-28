# =============================================================================
# Input Variables
# =============================================================================
# All configurable parameters for the platform infrastructure.
# Sensitive values should be provided via terraform.tfvars (never committed)
# or via environment variables (TF_VAR_<name>).
# =============================================================================

# -----------------------------------------------------------------------------
# General
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Deployment environment (staging, production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

variable "region" {
  description = "AWS region — all services colocated in Frankfurt"
  type        = string
  default     = "eu-central-1"
}

variable "domain_name" {
  description = "Primary domain name for the platform"
  type        = string
  default     = "platform.co.il"
}

# -----------------------------------------------------------------------------
# Networking
# -----------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

# -----------------------------------------------------------------------------
# Database (Supabase-hosted PostgreSQL)
# -----------------------------------------------------------------------------

variable "database_url" {
  description = "PostgreSQL connection string (Supabase pooled connection)"
  type        = string
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Supabase
# -----------------------------------------------------------------------------

variable "supabase_url" {
  description = "Supabase project URL"
  type        = string
}

variable "supabase_service_role_key" {
  description = "Supabase service role key (full access, server-side only)"
  type        = string
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Cache (Upstash Redis)
# -----------------------------------------------------------------------------

variable "redis_url" {
  description = "Upstash Redis REST URL"
  type        = string
  sensitive   = true
}

# -----------------------------------------------------------------------------
# AI (OpenAI)
# -----------------------------------------------------------------------------

variable "openai_api_key" {
  description = "OpenAI API key for moderation, embeddings, and matching"
  type        = string
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Search (Meilisearch)
# -----------------------------------------------------------------------------

variable "meilisearch_master_key" {
  description = "Meilisearch master key for authentication"
  type        = string
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Payments (Stripe)
# -----------------------------------------------------------------------------

variable "stripe_secret_key" {
  description = "Stripe secret API key"
  type        = string
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Email (Resend)
# -----------------------------------------------------------------------------

variable "resend_api_key" {
  description = "Resend API key for transactional email"
  type        = string
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Tags (applied to all resources)
# -----------------------------------------------------------------------------

locals {
  common_tags = {
    Project     = "platform"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

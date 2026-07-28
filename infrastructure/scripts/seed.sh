#!/usr/bin/env bash
# =============================================================================
# seed.sh — Database seed script for the Platform
# =============================================================================
# Usage: ./seed.sh [environment]
#
# Environments: development, staging (production is BLOCKED)
#
# Seeds the database with sample data for development/testing.
# This script will NEVER run against production to prevent data corruption.
#
# Examples:
#   ./seed.sh development    # Seed local dev database
#   ./seed.sh staging        # Seed staging database (with confirmation)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Color output helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}    $*"; }
error()   { echo -e "${RED}[ERROR]${NC}   $*"; exit 1; }

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
ALLOWED_ENVS=("development" "staging")
ENV="${1:-}"

if [[ -z "$ENV" ]]; then
  echo "Usage: $0 <environment>"
  echo ""
  echo "  Allowed environments: ${ALLOWED_ENVS[*]}"
  echo "  (production seeding is BLOCKED)"
  echo ""
  echo "Examples:"
  echo "  $0 development"
  echo "  $0 staging"
  exit 1
fi

# ---------------------------------------------------------------------------
# BLOCK production seeding — this is a hard safety check
# ---------------------------------------------------------------------------
if [[ "$ENV" == "production" || "$ENV" == "prod" ]]; then
  error "BLOCKED: Seeding the production database is not allowed.
  Seed data is for development and testing purposes only.
  If you need to add initial data to production, use a migration instead."
fi

# Validate environment
if [[ ! " ${ALLOWED_ENVS[*]} " =~ " ${ENV} " ]]; then
  error "Invalid environment: '${ENV}'. Must be one of: ${ALLOWED_ENVS[*]}"
fi

# ---------------------------------------------------------------------------
# Load environment-specific DATABASE_URL
# ---------------------------------------------------------------------------
load_database_url() {
  # If already set as env var, use that
  if [[ -n "${DATABASE_URL:-}" ]]; then
    info "Using DATABASE_URL from environment"
    return 0
  fi

  # Try environment-specific env file
  local env_file="${ROOT_DIR}/.env.${ENV}"
  if [[ -f "$env_file" ]]; then
    info "Loading DATABASE_URL from ${env_file}"
    local url
    url=$(grep -E '^DATABASE_URL=' "$env_file" | head -1 | cut -d'=' -f2-)
    if [[ -n "$url" ]]; then
      export DATABASE_URL="$url"
      return 0
    fi
  fi

  # Try .env.local as fallback
  local local_env="${ROOT_DIR}/.env.local"
  if [[ -f "$local_env" ]]; then
    info "Loading DATABASE_URL from .env.local"
    local url
    url=$(grep -E '^DATABASE_URL=' "$local_env" | head -1 | cut -d'=' -f2-)
    if [[ -n "$url" ]]; then
      export DATABASE_URL="$url"
      return 0
    fi
  fi

  error "DATABASE_URL not found. Set it as an environment variable or in .env.${ENV}"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
info "Database seed — Environment: ${ENV}"
echo ""

# Load the database URL for the target environment
load_database_url

# Mask the connection string in logs (show only host)
DB_HOST=$(echo "${DATABASE_URL}" | sed -E 's|.*@([^:/]+).*|\1|' 2>/dev/null || echo "unknown")
info "Target database host: ${DB_HOST}"

# Confirm before seeding (even for staging — seed data can be disruptive)
if [[ "$ENV" == "staging" ]]; then
  warn "You are about to seed the STAGING database."
  warn "This will insert sample data which may affect existing records."
  warn "Target: ${DB_HOST}"
  echo ""
  read -r -p "Continue? (yes/no): " confirm
  if [[ "$confirm" != "yes" ]]; then
    warn "Seed cancelled by user"
    exit 0
  fi
else
  # Development — still confirm but with lighter messaging
  info "Target: ${DB_HOST}"
  read -r -p "Seed the ${ENV} database? (y/N): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" && "$confirm" != "yes" ]]; then
    warn "Seed cancelled by user"
    exit 0
  fi
fi

cd "${ROOT_DIR}"

info "Running database seed..."
echo ""

pnpm --filter @platform/db db:seed

echo ""
success "Database seeded successfully for ${ENV}"
info "Seed script finished at $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

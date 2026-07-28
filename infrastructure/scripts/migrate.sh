#!/usr/bin/env bash
# =============================================================================
# migrate.sh — Database migration runner for the Platform
# =============================================================================
# Usage: ./migrate.sh [environment] [--dry-run]
#
# Environments: staging, production
#
# Examples:
#   ./migrate.sh staging              # Run migrations on staging
#   ./migrate.sh production           # Run migrations on production (with confirmation)
#   ./migrate.sh staging --dry-run    # Preview migrations without applying
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
VALID_ENVS=("staging" "production")
ENV="${1:-}"
DRY_RUN=false

# Check for --dry-run flag in any position
for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then
    DRY_RUN=true
  fi
done

if [[ -z "$ENV" || "$ENV" == "--dry-run" ]]; then
  echo "Usage: $0 <environment> [--dry-run]"
  echo ""
  echo "  Environments: ${VALID_ENVS[*]}"
  echo ""
  echo "Options:"
  echo "  --dry-run    Preview pending migrations without applying"
  echo ""
  echo "Examples:"
  echo "  $0 staging"
  echo "  $0 production --dry-run"
  exit 1
fi

# Validate environment
if [[ ! " ${VALID_ENVS[*]} " =~ " ${ENV} " ]]; then
  error "Invalid environment: '${ENV}'. Must be one of: ${VALID_ENVS[*]}"
fi

# ---------------------------------------------------------------------------
# Load environment-specific DATABASE_URL
# ---------------------------------------------------------------------------
# The DATABASE_URL can come from:
#   1. An environment variable already set (e.g., from CI/CD)
#   2. An .env.[environment] file in the project root
#   3. An .env.local file as a fallback

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
info "Database migration — Environment: ${ENV}"
echo ""

# Load the database URL for the target environment
load_database_url

# Mask the connection string in logs (show only host)
DB_HOST=$(echo "${DATABASE_URL}" | sed -E 's|.*@([^:/]+).*|\1|' 2>/dev/null || echo "unknown")
info "Target database host: ${DB_HOST}"

# Production safety check
if [[ "$ENV" == "production" && "$DRY_RUN" == "false" ]]; then
  warn "You are about to run migrations on the PRODUCTION database."
  warn "Target: ${DB_HOST}"
  echo ""
  read -r -p "Continue? (yes/no): " confirm
  if [[ "$confirm" != "yes" ]]; then
    warn "Migration cancelled by user"
    exit 0
  fi
fi

cd "${ROOT_DIR}"

if [[ "$DRY_RUN" == "true" ]]; then
  # Dry run: show migration status without applying
  info "Dry run — checking migration status..."
  echo ""

  pnpm --filter @platform/db prisma migrate status

  echo ""
  info "Dry run complete. No changes were applied."
else
  # Apply pending migrations
  info "Applying pending migrations..."
  echo ""

  pnpm --filter @platform/db prisma migrate deploy

  echo ""
  success "Migrations applied successfully to ${ENV}"

  # Show current migration status
  info "Current migration status:"
  pnpm --filter @platform/db prisma migrate status
fi

echo ""
info "Migration script finished at $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

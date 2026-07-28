#!/usr/bin/env bash
# =============================================================================
# reindex.sh — Meilisearch reindex script for the Platform
# =============================================================================
# Usage: ./reindex.sh [environment] [index] [--fresh]
#
# Environments: staging, production
# Indexes:      all, threads, posts, articles, courses, freelancers, classifieds, portfolios
#
# Options:
#   --fresh    Delete and recreate the index(es) before reindexing.
#              WARNING: This causes temporary search downtime for affected indexes.
#
# Examples:
#   ./reindex.sh staging all              # Reindex everything on staging
#   ./reindex.sh production threads       # Reindex only threads on production
#   ./reindex.sh staging all --fresh      # Delete + recreate + reindex all
#   ./reindex.sh production articles      # Reindex articles on production
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Color output helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}    $*"; }
error()   { echo -e "${RED}[ERROR]${NC}   $*"; exit 1; }
progress(){ echo -e "${CYAN}[PROGRESS]${NC} $*"; }

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Meilisearch index names — must match packages/search/src/indexes.ts
ALL_INDEXES=("threads" "posts" "articles" "courses" "freelancers" "classifieds" "portfolios")

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
VALID_ENVS=("staging" "production")
VALID_INDEXES=("all" "${ALL_INDEXES[@]}")

ENV="${1:-}"
INDEX="${2:-}"
FRESH=false

# Check for --fresh flag in any position
for arg in "$@"; do
  if [[ "$arg" == "--fresh" ]]; then
    FRESH=true
  fi
done

if [[ -z "$ENV" || -z "$INDEX" || "$ENV" == "--fresh" || "$INDEX" == "--fresh" ]]; then
  echo "Usage: $0 <environment> <index> [--fresh]"
  echo ""
  echo "  Environments: ${VALID_ENVS[*]}"
  echo "  Indexes:      ${VALID_INDEXES[*]}"
  echo ""
  echo "Options:"
  echo "  --fresh    Delete and recreate index(es) before reindexing"
  echo ""
  echo "Examples:"
  echo "  $0 staging all"
  echo "  $0 production threads"
  echo "  $0 staging all --fresh"
  exit 1
fi

# Validate environment
if [[ ! " ${VALID_ENVS[*]} " =~ " ${ENV} " ]]; then
  error "Invalid environment: '${ENV}'. Must be one of: ${VALID_ENVS[*]}"
fi

# Validate index
if [[ ! " ${VALID_INDEXES[*]} " =~ " ${INDEX} " ]]; then
  error "Invalid index: '${INDEX}'. Must be one of: ${VALID_INDEXES[*]}"
fi

# ---------------------------------------------------------------------------
# Required environment variables
# ---------------------------------------------------------------------------
check_env_vars() {
  # Load from env file if needed
  if [[ -z "${MEILISEARCH_HOST:-}" ]]; then
    local env_file="${ROOT_DIR}/.env.${ENV}"
    local local_env="${ROOT_DIR}/.env.local"

    if [[ -f "$env_file" ]]; then
      info "Loading Meilisearch config from ${env_file}"
      MEILISEARCH_HOST=$(grep -E '^MEILISEARCH_HOST=' "$env_file" | head -1 | cut -d'=' -f2- || true)
      MEILISEARCH_API_KEY=$(grep -E '^MEILISEARCH_API_KEY=' "$env_file" | head -1 | cut -d'=' -f2- || true)
    elif [[ -f "$local_env" ]]; then
      info "Loading Meilisearch config from .env.local"
      MEILISEARCH_HOST=$(grep -E '^MEILISEARCH_HOST=' "$local_env" | head -1 | cut -d'=' -f2- || true)
      MEILISEARCH_API_KEY=$(grep -E '^MEILISEARCH_API_KEY=' "$local_env" | head -1 | cut -d'=' -f2- || true)
    fi
  fi

  if [[ -z "${MEILISEARCH_HOST:-}" ]]; then
    error "MEILISEARCH_HOST is not set. Set it as an environment variable or in .env.${ENV}"
  fi

  if [[ -z "${MEILISEARCH_API_KEY:-}" ]]; then
    error "MEILISEARCH_API_KEY is not set. Set it as an environment variable or in .env.${ENV}"
  fi

  # Also need DATABASE_URL for fetching data
  if [[ -z "${DATABASE_URL:-}" ]]; then
    local env_file="${ROOT_DIR}/.env.${ENV}"
    local local_env="${ROOT_DIR}/.env.local"

    if [[ -f "$env_file" ]]; then
      DATABASE_URL=$(grep -E '^DATABASE_URL=' "$env_file" | head -1 | cut -d'=' -f2- || true)
    elif [[ -f "$local_env" ]]; then
      DATABASE_URL=$(grep -E '^DATABASE_URL=' "$local_env" | head -1 | cut -d'=' -f2- || true)
    fi

    if [[ -n "${DATABASE_URL:-}" ]]; then
      export DATABASE_URL
    else
      error "DATABASE_URL is not set. Set it as an environment variable or in .env.${ENV}"
    fi
  fi

  export MEILISEARCH_HOST
  export MEILISEARCH_API_KEY
}

# ---------------------------------------------------------------------------
# Meilisearch API helpers (using curl)
# ---------------------------------------------------------------------------
meili_request() {
  local method="$1"
  local endpoint="$2"
  local data="${3:-}"

  local args=(
    -s
    -X "$method"
    -H "Authorization: Bearer ${MEILISEARCH_API_KEY}"
    -H "Content-Type: application/json"
  )

  if [[ -n "$data" ]]; then
    args+=(-d "$data")
  fi

  curl "${args[@]}" "${MEILISEARCH_HOST}${endpoint}"
}

# Check if Meilisearch is reachable
check_meilisearch_health() {
  info "Checking Meilisearch health at ${MEILISEARCH_HOST}..."

  local health
  health=$(meili_request GET "/health" 2>/dev/null || echo "")

  if [[ -z "$health" ]]; then
    error "Cannot reach Meilisearch at ${MEILISEARCH_HOST}"
  fi

  local status
  status=$(echo "$health" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "unknown")

  if [[ "$status" != "available" ]]; then
    error "Meilisearch is not healthy. Status: ${status}"
  fi

  success "Meilisearch is healthy"
}

# Delete an index
delete_index() {
  local index_name="$1"
  info "Deleting index: ${index_name}..."
  meili_request DELETE "/indexes/${index_name}" > /dev/null 2>&1 || true
  # Wait briefly for deletion to process
  sleep 1
}

# Get document count for an index
get_index_stats() {
  local index_name="$1"
  local stats
  stats=$(meili_request GET "/indexes/${index_name}/stats" 2>/dev/null || echo '{}')
  local count
  count=$(echo "$stats" | grep -o '"numberOfDocuments":[0-9]*' | cut -d':' -f2 || echo "0")
  echo "${count:-0}"
}

# Wait for a task to complete
wait_for_task() {
  local task_uid="$1"
  local max_wait=300  # 5 minutes max
  local elapsed=0

  while [[ $elapsed -lt $max_wait ]]; do
    local task_status
    task_status=$(meili_request GET "/tasks/${task_uid}" 2>/dev/null || echo '{}')
    local status
    status=$(echo "$task_status" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")

    case "$status" in
      succeeded)
        return 0
        ;;
      failed)
        warn "Task ${task_uid} failed"
        echo "$task_status"
        return 1
        ;;
      *)
        sleep 2
        elapsed=$((elapsed + 2))
        ;;
    esac
  done

  warn "Task ${task_uid} timed out after ${max_wait}s"
  return 1
}

# ---------------------------------------------------------------------------
# Reindex functions — each index fetches data from DB via a Node.js script
# ---------------------------------------------------------------------------

# The reindex logic is delegated to a Node.js script that:
#   1. Connects to PostgreSQL via Prisma
#   2. Fetches relevant data with proper transforms
#   3. Pushes documents to Meilisearch in batches
#
# This approach is used because:
#   - Prisma handles the DB connection and schema knowledge
#   - TypeScript types ensure document shape matches index settings
#   - Batch processing handles large datasets efficiently
#
# The Node.js reindex runner is invoked per index.

reindex_single() {
  local index_name="$1"

  info "Reindexing: ${index_name}..."

  # If --fresh, delete and wait
  if [[ "$FRESH" == "true" ]]; then
    delete_index "$index_name"
    info "Index '${index_name}' deleted, recreating..."
  fi

  # Get count before
  local before_count
  before_count=$(get_index_stats "$index_name")

  # Run the Node.js reindex script via pnpm
  # The script is in packages/search and accepts the index name as argument
  cd "${ROOT_DIR}"

  progress "Fetching data from DB and pushing to Meilisearch..."
  pnpm --filter @platform/search reindex -- --index="${index_name}" --env="${ENV}"

  # Get count after
  local after_count
  after_count=$(get_index_stats "$index_name")

  success "Index '${index_name}' reindexed: ${before_count} → ${after_count} documents"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
info "Meilisearch reindex — Environment: ${ENV}, Index: ${INDEX}, Fresh: ${FRESH}"
echo ""

# Load env vars
check_env_vars

# Verify Meilisearch connectivity
check_meilisearch_health
echo ""

# Production safety check
if [[ "$ENV" == "production" ]]; then
  if [[ "$FRESH" == "true" ]]; then
    warn "WARNING: You are about to DELETE and RECREATE indexes on PRODUCTION."
    warn "This will cause SEARCH DOWNTIME during reindexing."
  else
    warn "You are about to reindex PRODUCTION search data."
  fi
  echo ""
  read -r -p "Continue? (yes/no): " confirm
  if [[ "$confirm" != "yes" ]]; then
    warn "Reindex cancelled by user"
    exit 0
  fi
  echo ""
fi

# Determine which indexes to process
if [[ "$INDEX" == "all" ]]; then
  INDEXES_TO_PROCESS=("${ALL_INDEXES[@]}")
else
  INDEXES_TO_PROCESS=("$INDEX")
fi

# Track results
TOTAL=${#INDEXES_TO_PROCESS[@]}
COMPLETED=0
FAILED=0

for idx in "${INDEXES_TO_PROCESS[@]}"; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if reindex_single "$idx"; then
    COMPLETED=$((COMPLETED + 1))
  else
    FAILED=$((FAILED + 1))
    warn "Failed to reindex: ${idx}"
  fi
  echo ""
done

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
info "Reindex summary:"
info "  Total:     ${TOTAL}"
success "  Completed: ${COMPLETED}"
if [[ $FAILED -gt 0 ]]; then
  warn "  Failed:    ${FAILED}"
fi

echo ""
if [[ $FAILED -eq 0 ]]; then
  success "All indexes reindexed successfully for ${ENV}"
else
  warn "Reindex completed with ${FAILED} failure(s)"
  exit 1
fi

info "Reindex script finished at $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

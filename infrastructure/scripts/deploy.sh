#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Main deployment helper for the Kehila Community Platform
# =============================================================================
# Usage: ./deploy.sh [environment] [component]
#
# Environments: staging, production
# Components:   all, web, workers, ws-server, terraform
#
# Examples:
#   ./deploy.sh staging web        # Deploy web app to staging
#   ./deploy.sh production all     # Deploy everything to production
#   ./deploy.sh staging workers    # Build and deploy all Lambda workers
#   ./deploy.sh production terraform  # Apply Terraform changes to production
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
TERRAFORM_DIR="${ROOT_DIR}/infrastructure/terraform"
DOCKER_DIR="${ROOT_DIR}/infrastructure/docker"
WORKERS_DIR="${ROOT_DIR}/workers"

AWS_REGION="${AWS_REGION:-eu-central-1}"
ECR_REGISTRY="${AWS_ACCOUNT_ID:-}.dkr.ecr.${AWS_REGION}.amazonaws.com"

WORKERS=("ai-worker" "search-indexer" "notification-worker" "media-processor")

# ---------------------------------------------------------------------------
# Validate arguments
# ---------------------------------------------------------------------------
VALID_ENVS=("staging" "production")
VALID_COMPONENTS=("all" "web" "workers" "ws-server" "terraform")

ENV="${1:-}"
COMPONENT="${2:-}"

if [[ -z "$ENV" || -z "$COMPONENT" ]]; then
  echo "Usage: $0 <environment> <component>"
  echo ""
  echo "  Environments: ${VALID_ENVS[*]}"
  echo "  Components:   ${VALID_COMPONENTS[*]}"
  echo ""
  echo "Examples:"
  echo "  $0 staging web"
  echo "  $0 production all"
  exit 1
fi

# Validate environment
if [[ ! " ${VALID_ENVS[*]} " =~ " ${ENV} " ]]; then
  error "Invalid environment: '${ENV}'. Must be one of: ${VALID_ENVS[*]}"
fi

# Validate component
if [[ ! " ${VALID_COMPONENTS[*]} " =~ " ${COMPONENT} " ]]; then
  error "Invalid component: '${COMPONENT}'. Must be one of: ${VALID_COMPONENTS[*]}"
fi

# ---------------------------------------------------------------------------
# Required environment variables check
# ---------------------------------------------------------------------------
check_env_var() {
  local var_name="$1"
  if [[ -z "${!var_name:-}" ]]; then
    error "Required environment variable ${var_name} is not set"
  fi
}

# ---------------------------------------------------------------------------
# Deploy: Web (Next.js → Vercel)
# ---------------------------------------------------------------------------
deploy_web() {
  info "Deploying web app to ${ENV}..."

  cd "${ROOT_DIR}"

  # Build the monorepo (Turborepo builds all dependencies first)
  info "Building monorepo with Turborepo..."
  pnpm turbo build --filter=@platform/web...

  # Deploy to Vercel
  if [[ "$ENV" == "production" ]]; then
    info "Deploying to Vercel (production)..."
    pnpm vercel deploy --prod --yes
  else
    info "Deploying to Vercel (staging preview)..."
    pnpm vercel deploy --yes
  fi

  success "Web app deployed to ${ENV}"
}

# ---------------------------------------------------------------------------
# Deploy: Workers (Lambda functions → ECR → Lambda update)
# ---------------------------------------------------------------------------
deploy_workers() {
  info "Deploying all Lambda workers to ${ENV}..."

  check_env_var "AWS_ACCOUNT_ID"

  # Authenticate Docker with ECR
  info "Authenticating Docker with ECR..."
  aws ecr get-login-password --region "${AWS_REGION}" \
    | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

  for worker in "${WORKERS[@]}"; do
    info "Building worker: ${worker}..."

    local image_name="platform-${worker}-${ENV}"
    local image_tag="${ECR_REGISTRY}/${image_name}:latest"
    local git_tag="${ECR_REGISTRY}/${image_name}:$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

    # Build Docker image using the shared worker Dockerfile (monorepo root context)
    docker build \
      -f "${DOCKER_DIR}/Dockerfile.worker" \
      --build-arg WORKER_NAME="${worker}" \
      -t "${image_tag}" \
      -t "${git_tag}" \
      "${ROOT_DIR}"

    # Push to ECR
    info "Pushing ${worker} to ECR..."
    docker push "${image_tag}"
    docker push "${git_tag}"

    # Update Lambda function to use new image
    local function_name="platform-${worker}-${ENV}"
    info "Updating Lambda function: ${function_name}..."
    aws lambda update-function-code \
      --region "${AWS_REGION}" \
      --function-name "${function_name}" \
      --image-uri "${image_tag}" \
      --no-cli-pager

    # Wait for the update to complete
    info "Waiting for Lambda function ${function_name} to stabilize..."
    aws lambda wait function-updated-v2 \
      --region "${AWS_REGION}" \
      --function-name "${function_name}"

    success "Worker ${worker} deployed"
  done

  success "All Lambda workers deployed to ${ENV}"
}

# ---------------------------------------------------------------------------
# Deploy: WS Server (Socket.IO → ECR → ECS)
# ---------------------------------------------------------------------------
deploy_ws_server() {
  info "Deploying WebSocket server to ${ENV}..."

  check_env_var "AWS_ACCOUNT_ID"

  local image_name="platform-ws-server-${ENV}"
  local image_tag="${ECR_REGISTRY}/${image_name}:latest"
  local git_tag="${ECR_REGISTRY}/${image_name}:$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

  # Authenticate Docker with ECR
  info "Authenticating Docker with ECR..."
  aws ecr get-login-password --region "${AWS_REGION}" \
    | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

  # Build Docker image
  info "Building WS server Docker image..."
  docker build \
    -f "${DOCKER_DIR}/Dockerfile.ws-server" \
    -t "${image_tag}" \
    -t "${git_tag}" \
    "${ROOT_DIR}/apps/ws-server/"

  # Push to ECR
  info "Pushing WS server image to ECR..."
  docker push "${image_tag}"
  docker push "${git_tag}"

  # Update ECS service to trigger new deployment
  local cluster_name="platform-cluster-${ENV}"
  local service_name="ws-server-${ENV}"

  info "Updating ECS service: ${service_name}..."
  aws ecs update-service \
    --region "${AWS_REGION}" \
    --cluster "${cluster_name}" \
    --service "${service_name}" \
    --force-new-deployment \
    --no-cli-pager

  info "Waiting for ECS service to stabilize (this may take a few minutes)..."
  aws ecs wait services-stable \
    --region "${AWS_REGION}" \
    --cluster "${cluster_name}" \
    --services "${service_name}"

  success "WebSocket server deployed to ${ENV}"
}

# ---------------------------------------------------------------------------
# Deploy: Terraform (Infrastructure changes)
# ---------------------------------------------------------------------------
deploy_terraform() {
  info "Running Terraform for ${ENV}..."

  cd "${TERRAFORM_DIR}"

  # Initialize Terraform (download providers, configure backend)
  info "Initializing Terraform..."
  terraform init -input=false

  # Select or create the workspace matching the environment
  terraform workspace select "${ENV}" 2>/dev/null || terraform workspace new "${ENV}"

  if [[ "$ENV" == "production" ]]; then
    # Production: plan first, then apply with explicit approval
    info "Creating Terraform plan for production..."
    terraform plan \
      -var="environment=${ENV}" \
      -out=tfplan

    warn "Review the plan above carefully."
    read -r -p "Apply this plan to PRODUCTION? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
      warn "Terraform apply cancelled by user"
      rm -f tfplan
      return 0
    fi

    info "Applying Terraform plan to production..."
    terraform apply tfplan
    rm -f tfplan
  else
    # Staging: plan and auto-approve
    info "Applying Terraform changes to staging..."
    terraform apply \
      -var="environment=${ENV}" \
      -auto-approve
  fi

  success "Terraform applied for ${ENV}"
}

# ---------------------------------------------------------------------------
# Deploy: All components
# ---------------------------------------------------------------------------
deploy_all() {
  info "=== Full deployment to ${ENV} ==="
  echo ""

  if [[ "$ENV" == "production" ]]; then
    warn "You are about to deploy ALL components to PRODUCTION."
    read -r -p "Continue? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
      warn "Full deployment cancelled by user"
      exit 0
    fi
  fi

  # 1. Infrastructure first
  deploy_terraform

  # 2. Database migrations (via separate script)
  info "Running database migrations..."
  "${SCRIPT_DIR}/migrate.sh" "${ENV}"

  # 3. Backend workers
  deploy_workers

  # 4. WebSocket server
  deploy_ws_server

  # 5. Web app last (depends on all backend services being ready)
  deploy_web

  echo ""
  success "=== Full deployment to ${ENV} complete ==="
}

# ---------------------------------------------------------------------------
# Main — dispatch to component handler
# ---------------------------------------------------------------------------
info "Platform deployment — Environment: ${ENV}, Component: ${COMPONENT}"
echo ""

case "$COMPONENT" in
  web)        deploy_web ;;
  workers)    deploy_workers ;;
  ws-server)  deploy_ws_server ;;
  terraform)  deploy_terraform ;;
  all)        deploy_all ;;
esac

echo ""
info "Deployment finished at $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

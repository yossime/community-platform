#!/usr/bin/env bash
# =============================================================================
# bootstrap-terraform.sh — One-time setup for Terraform state backend
# =============================================================================
# Creates the S3 bucket and DynamoDB table required for Terraform remote state,
# generates an SSH key pair for Meilisearch EC2 instances, and ensures keys
# are git-ignored.
#
# Usage: ./bootstrap-terraform.sh
#
# Prerequisites:
#   - AWS CLI configured with sufficient permissions
#   - Environment variable AWS_REGION (default: eu-central-1)
# =============================================================================

set -euo pipefail

AWS_REGION="${AWS_REGION:-eu-central-1}"
STATE_BUCKET="platform-terraform-state"
LOCK_TABLE="terraform-state-lock"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="${SCRIPT_DIR}/../terraform"
KEYS_DIR="${TERRAFORM_DIR}/keys"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC}   $*"; exit 1; }

# ---------------------------------------------------------------------------
# 1. Create S3 bucket for Terraform state
# ---------------------------------------------------------------------------
info "Creating S3 bucket: ${STATE_BUCKET}..."

if aws s3api head-bucket --bucket "${STATE_BUCKET}" 2>/dev/null; then
  info "Bucket ${STATE_BUCKET} already exists, skipping."
else
  aws s3api create-bucket \
    --bucket "${STATE_BUCKET}" \
    --region "${AWS_REGION}" \
    --create-bucket-configuration LocationConstraint="${AWS_REGION}"

  # Enable versioning
  aws s3api put-bucket-versioning \
    --bucket "${STATE_BUCKET}" \
    --versioning-configuration Status=Enabled

  # Enable server-side encryption
  aws s3api put-bucket-encryption \
    --bucket "${STATE_BUCKET}" \
    --server-side-encryption-configuration '{
      "Rules": [{
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "aws:kms"
        },
        "BucketKeyEnabled": true
      }]
    }'

  # Block all public access
  aws s3api put-public-access-block \
    --bucket "${STATE_BUCKET}" \
    --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

  success "S3 bucket ${STATE_BUCKET} created with versioning and encryption."
fi

# ---------------------------------------------------------------------------
# 2. Create DynamoDB table for state locking
# ---------------------------------------------------------------------------
info "Creating DynamoDB table: ${LOCK_TABLE}..."

if aws dynamodb describe-table --table-name "${LOCK_TABLE}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  info "Table ${LOCK_TABLE} already exists, skipping."
else
  aws dynamodb create-table \
    --table-name "${LOCK_TABLE}" \
    --region "${AWS_REGION}" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --tags Key=Project,Value=platform Key=ManagedBy,Value=terraform

  aws dynamodb wait table-exists --table-name "${LOCK_TABLE}" --region "${AWS_REGION}"
  success "DynamoDB table ${LOCK_TABLE} created."
fi

# ---------------------------------------------------------------------------
# 3. Generate SSH key pair for Meilisearch EC2 instances
# ---------------------------------------------------------------------------
info "Generating SSH key pair for Meilisearch..."

mkdir -p "${KEYS_DIR}"

if [[ -f "${KEYS_DIR}/meilisearch.pem" ]]; then
  info "SSH key already exists at ${KEYS_DIR}/meilisearch.pem, skipping."
else
  ssh-keygen -t ed25519 -f "${KEYS_DIR}/meilisearch" -N "" -C "meilisearch-${AWS_REGION}"
  mv "${KEYS_DIR}/meilisearch" "${KEYS_DIR}/meilisearch.pem"
  chmod 400 "${KEYS_DIR}/meilisearch.pem"
  success "SSH key pair generated at ${KEYS_DIR}/meilisearch.pem"
fi

# ---------------------------------------------------------------------------
# 4. Ensure keys are git-ignored
# ---------------------------------------------------------------------------
GITIGNORE="${KEYS_DIR}/.gitignore"
if [[ ! -f "${GITIGNORE}" ]]; then
  cat > "${GITIGNORE}" <<'EOF'
# SSH keys — never commit
*.pem
*.pub
*.key
EOF
  success "Created ${GITIGNORE}"
fi

echo ""
success "Terraform bootstrap complete!"
info "You can now run: cd ${TERRAFORM_DIR} && terraform init"

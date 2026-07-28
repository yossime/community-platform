# =============================================================================
# Backend Configuration — S3 + DynamoDB State Locking
# =============================================================================
# Remote state stored in S3 with DynamoDB-based locking to prevent concurrent
# modifications. The S3 bucket and DynamoDB table must be created manually or
# via a separate bootstrap Terraform configuration before running `terraform init`.
# =============================================================================

terraform {
  backend "s3" {
    bucket         = "platform-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "eu-central-1"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}

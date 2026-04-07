# GCS backend for Terraform state
# The bucket must be created manually before first use:
#   gsutil mb -l europe-west1 gs://rcq-terraform-state-{env}
#   gsutil versioning set on gs://rcq-terraform-state-{env}
#
# Initialize with:
#   terraform init -backend-config="bucket=rcq-terraform-state-dev" (or test/prod)

terraform {
  backend "gcs" {
    prefix = "terraform/state"
    # bucket is set via -backend-config="bucket=rcq-terraform-state-{env}"
  }
}


# Temporary local backend for testing
# This file should NOT be used in production
# Delete this file and use GCS backend for actual deployments

terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}


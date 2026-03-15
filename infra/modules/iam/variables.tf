variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "europe-west1"
}

variable "environment" {
  description = "Environment name (dev, test, prod)"
  type        = string
}

variable "metabase_service_account" {
  description = "Metabase service account email"
  type        = string
}

variable "api_service_account" {
  description = "API service account email"
  type        = string
}

variable "frontend_service_account" {
  description = "Frontend service account email"
  type        = string
}


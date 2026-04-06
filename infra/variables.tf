variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "europe-west1"
}

variable "environment" {
  description = "Environment name (dev, test, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "test", "prod"], var.environment)
    error_message = "Environment must be dev, test, or prod."
  }
}

variable "cloud_sql_connection_name" {
  description = "Cloud SQL connection name (project:region:instance)"
  type        = string
}

variable "rcq_db_name" {
  description = "RCQ application database name"
  type        = string
  default     = "rcq_fr_dev_db"
}

variable "superset_image" {
  description = "Superset Docker image"
  type        = string
  default     = "apache/superset:latest"
}

variable "api_image" {
  description = "FastAPI backend Docker image"
  type        = string
  default     = "gcr.io/rcq-fr-dev/rcq-api:latest"
}

variable "frontend_image" {
  description = "Angular frontend Docker image"
  type        = string
  default     = "gcr.io/rcq-fr-dev/rcq-frontend:latest"
}

# ─── Domain configuration ────────────────────────────────────────────

variable "frontend_domain" {
  description = "Custom domain for the frontend (e.g., dev.graph.redcrossquest.com or graph.redcrossquest.com for prod)"
  type        = string
}

variable "api_domain" {
  description = "Custom domain for the API (e.g., back.dev.graph.redcrossquest.com or back.graph.redcrossquest.com for prod)"
  type        = string
}

variable "superset_domain" {
  description = "Custom domain for Superset (e.g., superset.dev.graph.redcrossquest.com or superset.graph.redcrossquest.com for prod)"
  type        = string
}

variable "enable_domain_mappings" {
  description = "Whether to create Cloud Run domain mappings (requires domain verification)"
  type        = bool
  default     = false
}


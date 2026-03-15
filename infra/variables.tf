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

variable "metabase_image" {
  description = "Metabase Docker image"
  type        = string
  default     = "metabase/metabase:latest"
}

variable "api_image" {
  description = "FastAPI backend Docker image"
  type        = string
  default     = "gcr.io/rcq-fr-dev/rcq_api:latest"
}

variable "frontend_image" {
  description = "Angular frontend Docker image"
  type        = string
  default     = "gcr.io/rcq-fr-dev/rcq_frontend:latest"
}


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
  description = "Superset Docker image (without tag)"
  type        = string
  default     = "apache/superset"
}

variable "api_image" {
  description = "FastAPI backend Docker image (without tag)"
  type        = string
  default     = "gcr.io/rcq-fr-dev/rcq-api"
}

variable "frontend_image" {
  description = "Angular frontend Docker image (without tag)"
  type        = string
  default     = "gcr.io/rcq-fr-dev/rcq-frontend"
}

variable "image_tag" {
  description = "Docker image tag for all Cloud Run services"
  type        = string
  default     = "latest"
}

# ─── Superset admin ──────────────────────────────────────────────────

variable "superset_admin_username" {
  description = "Superset admin username"
  type        = string
  default     = "admin"
}

variable "superset_admin_email" {
  description = "Superset admin email"
  type        = string
  default     = "admin@rcq.local"
}

variable "superset_admin_first_name" {
  description = "Superset admin first name"
  type        = string
  default     = "Admin"
}

variable "superset_admin_last_name" {
  description = "Superset admin last name"
  type        = string
  default     = "User"
}

# ─── Domain configuration ────────────────────────────────────────────

variable "frontend_domain" {
  description = "Custom domain for the frontend (e.g., dev.graph.redcrossquest.com or graph.redcrossquest.com for prod)"
  type        = string
}

variable "api_domain" {
  description = "Custom domain for the API (e.g., dev.back.graph.redcrossquest.com or back.graph.redcrossquest.com for prod)"
  type        = string
}

variable "superset_domain" {
  description = "Custom domain for Superset (e.g., dev.superset.graph.redcrossquest.com or superset.graph.redcrossquest.com for prod)"
  type        = string
}

variable "enable_domain_mappings" {
  description = "Whether to create Cloud Run domain mappings (requires domain verification)"
  type        = bool
  default     = true
}

# ─── Feature flags ──────────────────────────────────────────────────

variable "enable_superset" {
  description = "Enable Superset Cloud Run service and related resources"
  type        = bool
  default     = false
}

# ─── Valkey (Memorystore) ────────────────────────────────────────────

variable "valkey_node_type" {
  description = "Node type for Memorystore Valkey instance"
  type        = string
  default     = "SHARED_CORE_NANO"
}

variable "valkey_replica_count" {
  description = "Number of read replicas for Memorystore Valkey instance"
  type        = number
  default     = 0
}


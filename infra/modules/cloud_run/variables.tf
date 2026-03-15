variable "service_name" {
  description = "Name of the Cloud Run service"
  type        = string
}

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "image" {
  description = "Container image to deploy"
  type        = string
}

variable "env_vars" {
  description = "Environment variables for the container"
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Secret Manager secrets to mount as environment variables (key = env var name, value = secret ID)"
  type        = map(string)
  default     = {}
}

variable "cloud_sql_connections" {
  description = "List of Cloud SQL connection names"
  type        = list(string)
  default     = []
}

variable "cpu_limit" {
  description = "CPU limit for the container"
  type        = string
  default     = "1000m"
}

variable "memory_limit" {
  description = "Memory limit for the container"
  type        = string
  default     = "512Mi"
}

variable "min_instances" {
  description = "Minimum number of instances"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 10
}

variable "allow_unauthenticated" {
  description = "Allow unauthenticated access to the service"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Labels to apply to the service"
  type        = map(string)
  default     = {}
}


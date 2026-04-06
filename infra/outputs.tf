output "superset_url" {
  description = "Superset Cloud Run service URL"
  value       = module.superset.service_url
}

output "api_url" {
  description = "API Cloud Run service URL"
  value       = module.api.service_url
}

output "frontend_url" {
  description = "Frontend Cloud Run service URL"
  value       = module.frontend.service_url
}

output "superset_service_account" {
  description = "Superset service account email"
  value       = module.superset.service_account_email
}

output "api_service_account" {
  description = "API service account email"
  value       = module.api.service_account_email
}

output "frontend_service_account" {
  description = "Frontend service account email"
  value       = module.frontend.service_account_email
}


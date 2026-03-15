output "metabase_url" {
  description = "Metabase Cloud Run service URL"
  value       = module.metabase.service_url
}

output "api_url" {
  description = "API Cloud Run service URL"
  value       = module.api.service_url
}

output "frontend_url" {
  description = "Frontend Cloud Run service URL"
  value       = module.frontend.service_url
}

output "metabase_service_account" {
  description = "Metabase service account email"
  value       = module.metabase.service_account_email
}

output "api_service_account" {
  description = "API service account email"
  value       = module.api.service_account_email
}

output "frontend_service_account" {
  description = "Frontend service account email"
  value       = module.frontend.service_account_email
}


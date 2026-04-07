# ─── Service URLs ─────────────────────────────────────────────────────

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

# ─── Service Accounts ────────────────────────────────────────────────

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

# ─── Artifact Registry ───────────────────────────────────────────────

output "docker_registry_url" {
  description = "Artifact Registry URL for Docker images"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}

# ─── Custom Domains ──────────────────────────────────────────────────

output "custom_domains" {
  description = "Custom domain mappings (when enabled)"
  value = var.enable_domain_mappings ? {
    frontend = var.frontend_domain
    api      = var.api_domain
    superset = var.superset_domain
  } : null
}

output "dns_instructions" {
  description = "DNS records to add to redcrossquest.com zone (DNS zone file format)"
  value = join("\n", concat(
    [
      "🌐 DNS records to add to redcrossquest.com zone:",
      "",
    ],
    [
      "  ${replace(var.frontend_domain, ".redcrossquest.com", "")}${join("", [for i in range(max(0, 25 - length(replace(var.frontend_domain, ".redcrossquest.com", "")))) : " "])}3600  IN  CNAME  ghs.googlehosted.com.",
      "  ${replace(var.api_domain, ".redcrossquest.com", "")}${join("", [for i in range(max(0, 25 - length(replace(var.api_domain, ".redcrossquest.com", "")))) : " "])}3600  IN  CNAME  ghs.googlehosted.com.",
      "  ${replace(var.superset_domain, ".redcrossquest.com", "")}${join("", [for i in range(max(0, 25 - length(replace(var.superset_domain, ".redcrossquest.com", "")))) : " "])}3600  IN  CNAME  ghs.googlehosted.com.",
    ],
    var.enable_domain_mappings ? [
      "",
      "Note: It may take up to 24 hours for SSL certificates to be provisioned.",
    ] : [
      "",
      "Note: Domain mappings are disabled. Configure these DNS records in advance.",
      "Set enable_domain_mappings = true when ready to activate.",
    ]
  ))
}

# ─── Valkey (Memorystore) ─────────────────────────────────────────────

output "valkey_endpoints" {
  description = "Memorystore Valkey endpoints"
  value       = google_memorystore_instance.valkey.endpoints
}

output "superset_admin_proxy_command" {
  description = "Command to access Superset admin via gcloud proxy (for admin operations)"
  value       = "gcloud run services proxy rcq-superset --region=${var.region} --project=${var.project_id} --port=8088"
}


resource "google_service_account" "service" {
  account_id   = "${replace(var.service_name, "_", "-")}-sa"
  display_name = "Service account for ${var.service_name}"
  project      = var.project_id
}

resource "google_cloud_run_v2_service" "service" {
  name     = var.service_name
  location = var.region
  project  = var.project_id
  
  template {
    service_account = google_service_account.service.email
    
    containers {
      image = var.image
      
      # Environment variables
      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }
      
      # Secrets as environment variables
      dynamic "env" {
        for_each = var.secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
      
      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
      }
    }
    
    # Cloud SQL connections
    dynamic "volumes" {
      for_each = length(var.cloud_sql_connections) > 0 ? [1] : []
      content {
        name = "cloudsql"
        cloud_sql_instance {
          instances = var.cloud_sql_connections
        }
      }
    }
    
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }
  }
  
  labels = merge(
    var.tags,
    {
      managed-by = "terraform"
    }
  )
}

# Allow unauthenticated access (will be restricted by IAM in production)
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  count = var.allow_unauthenticated ? 1 : 0
  
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Grant service account access to secrets
resource "google_secret_manager_secret_iam_member" "secret_access" {
  for_each = var.secrets
  
  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.service.email}"
}

# Grant Cloud SQL client role if connections are specified
resource "google_project_iam_member" "cloudsql_client" {
  count = length(var.cloud_sql_connections) > 0 ? 1 : 0
  
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.service.email}"
}


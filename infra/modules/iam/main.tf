# Grant API service account permission to invoke Metabase
resource "google_cloud_run_service_iam_member" "api_to_metabase" {
  project  = var.project_id
  location = var.region
  service  = "rcq_metabase"
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.api_service_account}"
}

# Grant frontend service account permission to invoke API
resource "google_cloud_run_service_iam_member" "frontend_to_api" {
  project  = var.project_id
  location = var.region
  service  = "rcq_api"
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.frontend_service_account}"
}

# Grant logging permissions to all service accounts
resource "google_project_iam_member" "metabase_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${var.metabase_service_account}"
}

resource "google_project_iam_member" "api_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${var.api_service_account}"
}

resource "google_project_iam_member" "frontend_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${var.frontend_service_account}"
}

# Grant monitoring permissions
resource "google_project_iam_member" "metabase_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${var.metabase_service_account}"
}

resource "google_project_iam_member" "api_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${var.api_service_account}"
}

resource "google_project_iam_member" "frontend_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${var.frontend_service_account}"
}


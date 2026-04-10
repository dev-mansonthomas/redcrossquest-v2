# ─── Memorystore for Valkey 9 ─────────────────────────────────────────
# Valkey instance with IAM Auth (no password required).
# DB allocation:
#   - DB 0: Backend (cache, reserved for future use)
#   - DB 1: Superset (cache + Celery broker/result backend)

# Enable the Memorystore API
resource "google_project_service" "memorystore_api" {
  project = var.project_id
  service = "memorystore.googleapis.com"

  disable_on_destroy = false
}

# Enable Network Connectivity API
resource "google_project_service" "networkconnectivity_api" {
  project = var.project_id
  service = "networkconnectivity.googleapis.com"
  disable_on_destroy = false
}

# Service Connection Policy for Memorystore PSC
resource "google_network_connectivity_service_connection_policy" "valkey_psc" {
  name          = "rcq-valkey-psc-${var.environment}"
  project       = var.project_id
  location      = var.region
  service_class = "gcp-memorystore"
  network       = "projects/${var.project_id}/global/networks/default"

  psc_config {
    subnetworks = ["projects/${var.project_id}/regions/${var.region}/subnetworks/default"]
  }

  depends_on = [google_project_service.networkconnectivity_api]
}

# Memorystore for Valkey 9 instance
resource "google_memorystore_instance" "valkey" {
  instance_id             = "rcq-valkey-${var.environment}"
  location                = var.region
  shard_count             = 1
  engine_version          = "VALKEY_9_0"
  authorization_mode      = "IAM_AUTH"
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  node_type               = var.valkey_node_type
  replica_count           = var.valkey_replica_count

  desired_auto_created_endpoints {
    network    = "projects/${var.project_id}/global/networks/default"
    project_id = var.project_id
  }

  labels = {
    app         = "rcq"
    component   = "valkey"
    environment = var.environment
    managed-by  = "terraform"
  }

  depends_on = [
    google_project_service.memorystore_api,
    google_network_connectivity_service_connection_policy.valkey_psc
  ]
}

# ─── IAM — Valkey access for Cloud Run service accounts ──────────────
# Superset (Cloud Run) needs dbConnectionUser to connect to Valkey with IAM Auth
resource "google_project_iam_member" "superset_valkey_access" {
  project = var.project_id
  role    = "roles/memorystore.dbConnectionUser"
  member  = "serviceAccount:${module.superset.service_account_email}"
}

# API (Cloud Run) needs dbConnectionUser to connect to Valkey with IAM Auth (DB 0)
resource "google_project_iam_member" "api_valkey_access" {
  project = var.project_id
  role    = "roles/memorystore.dbConnectionUser"
  member  = "serviceAccount:${module.api.service_account_email}"
}

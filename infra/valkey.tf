# ─── Memorystore for Valkey 9 ─────────────────────────────────────────
# Valkey instance with IAM Auth (no password required).
# Used by Superset (cache + Celery broker/result backend on DB 1).
# Backend does not use Valkey currently (DB 0 reserved for future use).

# Enable the Memorystore API
resource "google_project_service" "memorystore_api" {
  project = var.project_id
  service = "memorystore.googleapis.com"

  disable_on_destroy = false
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

  depends_on = [google_project_service.memorystore_api]
}

# ─── IAM — Valkey access for Superset service account ─────────────────
# Superset (Cloud Run) needs dbConnectionUser to connect to Valkey with IAM Auth
resource "google_project_iam_member" "superset_valkey_access" {
  project = var.project_id
  role    = "roles/memorystore.dbConnectionUser"
  member  = "serviceAccount:${module.superset.service_account_email}"
}

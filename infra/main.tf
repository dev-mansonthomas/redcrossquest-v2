terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # Backend configuration in backend.tf (GCS)
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ─── Artifact Registry ───────────────────────────────────────────────
resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = "rcq-docker"
  description   = "Docker images for RedCrossQuest v2"
  format        = "DOCKER"

  labels = {
    app         = "rcq"
    environment = var.environment
    managed-by  = "terraform"
  }
}

# ─── Locals ──────────────────────────────────────────────────────────
locals {
  valkey_host = try(
    google_memorystore_instance.valkey.discovery_endpoints[0].address,
    google_memorystore_instance.valkey.endpoints[0].connections[0].psc_auto_connection[0].ip_address,
    "10.132.0.28"
  )
}

# ─── Cloud Run services ──────────────────────────────────────────────
module "superset" {
  source = "./modules/cloud_run"

  service_name   = "rcq-superset"
  project_id     = var.project_id
  region         = var.region
  image          = "${var.superset_image}:${var.image_tag}"
  container_port = 8088
  ingress        = "INGRESS_TRAFFIC_ALL"

  env_vars = {
    SUPERSET_DB_TYPE           = "mysql"
    SUPERSET_DB_NAME           = var.rcq_db_name
    SUPERSET_DB_PORT           = "3306"
    SUPERSET_DB_HOST           = "/cloudsql/${var.cloud_sql_connection_name}"
    VALKEY_HOST                = local.valkey_host
    VALKEY_PORT                = "6379"
    VALKEY_ENABLED             = "false"
    SUPERSET_METADATA_DB_TYPE  = "mysql"
    SUPERSET_METADATA_DB_NAME  = "superset_dev_db"
    SUPERSET_METADATA_DB_PORT  = "3306"
    SUPERSET_METADATA_DB_HOST  = "/cloudsql/${var.cloud_sql_connection_name}"
    SUPERSET_ADMIN_USERNAME    = "tom"
    SUPERSET_CORS_ORIGINS      = "https://${var.frontend_domain},https://${var.api_domain}"
    ENVIRONMENT                = var.environment
  }

  secrets = {
    SUPERSET_DB_USER          = google_secret_manager_secret.db_readonly_username.secret_id
    SUPERSET_DB_PASS          = google_secret_manager_secret.db_readonly_password.secret_id
    SUPERSET_SECRET_KEY       = google_secret_manager_secret.superset_secret_key.secret_id
    SUPERSET_METADATA_DB_USER = google_secret_manager_secret.superset_db_rw_username.secret_id
    SUPERSET_METADATA_DB_PASS = google_secret_manager_secret.superset_db_rw_password.secret_id
  }

  cloud_sql_connections = [var.cloud_sql_connection_name]

  tags = {
    app = "rcq"
    component = "superset"
    environment = var.environment
  }
}

module "api" {
  source = "./modules/cloud_run"

  service_name   = "rcq-api"
  project_id     = var.project_id
  region         = var.region
  image          = "${var.api_image}:${var.image_tag}"
  container_port = 8080
  ingress        = "INGRESS_TRAFFIC_ALL"
  
  env_vars = {
    ENVIRONMENT = var.environment
    DB_HOST = "/cloudsql/${var.cloud_sql_connection_name}"
    DB_NAME = var.rcq_db_name
  }
  
  secrets = {
    RCQ_DB_USER = google_secret_manager_secret.db_readonly_username.secret_id
    RCQ_DB_PASSWORD = google_secret_manager_secret.db_readonly_password.secret_id
    GOOGLE_OAUTH_CLIENT_ID = google_secret_manager_secret.google_oauth_client_id.secret_id
    GOOGLE_OAUTH_CLIENT_SECRET = google_secret_manager_secret.google_oauth_client_secret.secret_id
  }
  
  cloud_sql_connections = [var.cloud_sql_connection_name]
  
  tags = {
    app = "rcq"
    component = "api"
    environment = var.environment
  }
}

module "frontend" {
  source = "./modules/cloud_run"

  service_name   = "rcq-frontend"
  project_id     = var.project_id
  region         = var.region
  image          = "${var.frontend_image}:${var.image_tag}"
  container_port = 80
  ingress        = "INGRESS_TRAFFIC_ALL"
  
  env_vars = {
    API_URL = module.api.service_url
    ENVIRONMENT = var.environment
  }
  
  secrets = {}
  
  tags = {
    app = "rcq"
    component = "frontend"
    environment = var.environment
  }
}

# Secret Manager secrets


resource "google_secret_manager_secret" "superset_secret_key" {
  secret_id = "rcq_superset_secret_key"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  labels = {
    app = "rcq"
    component = "superset"
    environment = var.environment
  }
}

resource "google_secret_manager_secret" "db_readonly_username" {
  secret_id = "rcq_db_readonly_username"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  labels = {
    app = "rcq"
    component = "database"
    environment = var.environment
  }
}

resource "google_secret_manager_secret" "db_readonly_password" {
  secret_id = "rcq_db_readonly_password"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  labels = {
    app = "rcq"
    component = "database"
    environment = var.environment
  }
}

resource "google_secret_manager_secret" "google_oauth_client_id" {
  secret_id = "rcq_google_oauth_client_id"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  labels = {
    app = "rcq"
    component = "auth"
    environment = var.environment
  }
}

resource "google_secret_manager_secret" "google_oauth_client_secret" {
  secret_id = "rcq_google_oauth_client_secret"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  labels = {
    app = "rcq"
    component = "auth"
    environment = var.environment
  }
}

resource "google_secret_manager_secret" "superset_db_rw_username" {
  secret_id = "rcq_superset_db_rw_username"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  labels = {
    app         = "rcq"
    component   = "superset"
    environment = var.environment
  }
}

resource "google_secret_manager_secret" "superset_db_rw_password" {
  secret_id = "rcq_superset_db_rw_password"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  labels = {
    app         = "rcq"
    component   = "superset"
    environment = var.environment
  }
}

# ─── IAM for Cloud Run services ───────────────────────────────────────
module "iam" {
  source = "./modules/iam"

  project_id  = var.project_id
  environment = var.environment

  superset_service_account = module.superset.service_account_email
  api_service_account      = module.api.service_account_email
  frontend_service_account = module.frontend.service_account_email

  depends_on = [
    module.api,
    module.superset,
    module.frontend
  ]
}

# ─── Custom Domain Mappings ───────────────────────────────────────────
# Note: Domain must be verified in Google Search Console before mapping.
# Use `gcloud domains verify <domain>` to verify ownership.

resource "google_cloud_run_domain_mapping" "frontend" {
  count    = var.enable_domain_mappings ? 1 : 0
  location = var.region
  name     = var.frontend_domain

  metadata {
    namespace = var.project_id
    labels = {
      app         = "rcq"
      component   = "frontend"
      environment = var.environment
    }
  }

  spec {
    route_name = module.frontend.service_name
  }
}

resource "google_cloud_run_domain_mapping" "api" {
  count    = var.enable_domain_mappings ? 1 : 0
  location = var.region
  name     = var.api_domain

  metadata {
    namespace = var.project_id
    labels = {
      app         = "rcq"
      component   = "api"
      environment = var.environment
    }
  }

  spec {
    route_name = module.api.service_name
  }
}

resource "google_cloud_run_domain_mapping" "superset" {
  count    = var.enable_domain_mappings ? 1 : 0
  location = var.region
  name     = var.superset_domain

  metadata {
    namespace = var.project_id
    labels = {
      app         = "rcq"
      component   = "superset"
      environment = var.environment
    }
  }

  spec {
    route_name = module.superset.service_name
  }
}


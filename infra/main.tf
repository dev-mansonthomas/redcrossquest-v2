terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Backend configuration moved to backend-local.tf for testing
  # For production, use GCS backend:
  # backend "gcs" {
  #   bucket = "rcq-terraform-state-dev"  # or test/prod
  #   prefix = "terraform/state"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Cloud Run services
module "superset" {
  source = "./modules/cloud_run"

  service_name = "rcq_superset"
  project_id   = var.project_id
  region       = var.region
  image        = var.superset_image

  env_vars = {
    SUPERSET_DB_TYPE = "mysql"
    SUPERSET_DB_NAME = "rcq_superset_db"
    SUPERSET_DB_PORT = "3306"
    SUPERSET_DB_HOST = var.cloud_sql_connection_name
  }

  secrets = {
    SUPERSET_DB_USER = google_secret_manager_secret.superset_db_user.secret_id
    SUPERSET_DB_PASS = google_secret_manager_secret.superset_db_password.secret_id
    SUPERSET_SECRET_KEY = google_secret_manager_secret.superset_secret_key.secret_id
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
  
  service_name = "rcq_api"
  project_id   = var.project_id
  region       = var.region
  image        = var.api_image
  
  env_vars = {
    ENVIRONMENT = var.environment
    DB_HOST = var.cloud_sql_connection_name
    DB_NAME = var.rcq_db_name
  }
  
  secrets = {
    DB_USER = google_secret_manager_secret.api_db_user.secret_id
    DB_PASSWORD = google_secret_manager_secret.api_db_password.secret_id
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
  
  service_name = "rcq_frontend"
  project_id   = var.project_id
  region       = var.region
  image        = var.frontend_image
  
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
resource "google_secret_manager_secret" "superset_db_user" {
  secret_id = "rcq_superset_db_user_${var.environment}"

  replication {
    auto {}
  }

  labels = {
    app = "rcq"
    component = "superset"
    environment = var.environment
  }
}

resource "google_secret_manager_secret" "superset_db_password" {
  secret_id = "rcq_superset_db_password_${var.environment}"

  replication {
    auto {}
  }

  labels = {
    app = "rcq"
    component = "superset"
    environment = var.environment
  }
}

resource "google_secret_manager_secret" "superset_secret_key" {
  secret_id = "rcq_superset_secret_key_${var.environment}"

  replication {
    auto {}
  }

  labels = {
    app = "rcq"
    component = "superset"
    environment = var.environment
  }
}

resource "google_secret_manager_secret" "api_db_user" {
  secret_id = "rcq_api_db_user_${var.environment}"

  replication {
    auto {}
  }

  labels = {
    app = "rcq"
    component = "api"
    environment = var.environment
  }
}

resource "google_secret_manager_secret" "api_db_password" {
  secret_id = "rcq_api_db_password_${var.environment}"

  replication {
    auto {}
  }

  labels = {
    app = "rcq"
    component = "api"
    environment = var.environment
  }
}

resource "google_secret_manager_secret" "google_oauth_client_id" {
  secret_id = "rcq_google_oauth_client_id_${var.environment}"

  replication {
    auto {}
  }

  labels = {
    app = "rcq"
    component = "auth"
    environment = var.environment
  }
}

resource "google_secret_manager_secret" "google_oauth_client_secret" {
  secret_id = "rcq_google_oauth_client_secret_${var.environment}"

  replication {
    auto {}
  }

  labels = {
    app = "rcq"
    component = "auth"
    environment = var.environment
  }
}

# IAM for Cloud Run services
module "iam" {
  source = "./modules/iam"

  project_id  = var.project_id
  environment = var.environment

  superset_service_account = module.superset.service_account_email
  api_service_account      = module.api.service_account_email
  frontend_service_account = module.frontend.service_account_email
}


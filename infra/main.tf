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
module "metabase" {
  source = "./modules/cloud_run"
  
  service_name = "rcq_metabase"
  project_id   = var.project_id
  region       = var.region
  image        = var.metabase_image
  
  env_vars = {
    MB_DB_TYPE = "mysql"
    MB_DB_DBNAME = "rcq_metabase_db"
    MB_DB_PORT = "3306"
    MB_DB_HOST = var.cloud_sql_connection_name
  }
  
  secrets = {
    MB_DB_USER = google_secret_manager_secret.metabase_db_user.secret_id
    MB_DB_PASS = google_secret_manager_secret.metabase_db_password.secret_id
    MB_ENCRYPTION_SECRET_KEY = google_secret_manager_secret.metabase_encryption_key.secret_id
  }
  
  cloud_sql_connections = [var.cloud_sql_connection_name]
  
  tags = {
    app = "rcq"
    component = "metabase"
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
resource "google_secret_manager_secret" "metabase_db_user" {
  secret_id = "rcq_metabase_db_user_${var.environment}"
  
  replication {
    auto {}
  }
  
  labels = {
    app = "rcq"
    component = "metabase"
    environment = var.environment
  }
}

resource "google_secret_manager_secret" "metabase_db_password" {
  secret_id = "rcq_metabase_db_password_${var.environment}"
  
  replication {
    auto {}
  }
  
  labels = {
    app = "rcq"
    component = "metabase"
    environment = var.environment
  }
}

resource "google_secret_manager_secret" "metabase_encryption_key" {
  secret_id = "rcq_metabase_encryption_key_${var.environment}"

  replication {
    auto {}
  }

  labels = {
    app = "rcq"
    component = "metabase"
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

  metabase_service_account = module.metabase.service_account_email
  api_service_account      = module.api.service_account_email
  frontend_service_account = module.frontend.service_account_email
}


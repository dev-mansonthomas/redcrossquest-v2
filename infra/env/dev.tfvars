project_id  = "rcq-fr-dev"
region      = "europe-west1"
environment = "dev"

# Cloud SQL connection name - update with actual instance name
cloud_sql_connection_name = "rcq-fr-dev:europe-west1:rcq-db-inst-fr-dev-0"

# Database name
rcq_db_name = "rcq_fr_dev_db"

# Container images - will be updated by CI/CD
superset_image = "europe-west1-docker.pkg.dev/rcq-fr-dev/rcq-docker/rcq-superset"
api_image      = "europe-west1-docker.pkg.dev/rcq-fr-dev/rcq-docker/rcq-api"
frontend_image = "europe-west1-docker.pkg.dev/rcq-fr-dev/rcq-docker/rcq-frontend"
# image_tag    = "latest"  # Override with specific tag during deployment

# Superset admin
superset_admin_username   = "tom"
superset_admin_email      = "thomas.manson@croix-rouge.fr"
superset_admin_first_name = "Thomas"
superset_admin_last_name  = "Manson"

# Custom domain mappings
enable_domain_mappings = true
frontend_domain        = "dev.graph.redcrossquest.com"
api_domain             = "dev.back.graph.redcrossquest.com"
superset_domain        = "dev.superset.graph.redcrossquest.com"


project_id  = "rcq-fr-prod"
region      = "europe-west1"
environment = "prod"

# Cloud SQL connection name - update with actual instance name
cloud_sql_connection_name = "rcq-fr-prod:europe-west1:rcq-mysql-instance"

# Database name
rcq_db_name = "rcq_fr_prod_db"

# Container images - will be updated by CI/CD
superset_image = "europe-west1-docker.pkg.dev/rcq-fr-prod/rcq-docker/rcq-superset:latest"
api_image      = "europe-west1-docker.pkg.dev/rcq-fr-prod/rcq-docker/rcq-api:latest"
frontend_image = "europe-west1-docker.pkg.dev/rcq-fr-prod/rcq-docker/rcq-frontend:latest"

# Custom domain mappings (prod uses root domain without env prefix)
enable_domain_mappings = false
frontend_domain        = "graph.redcrossquest.com"
api_domain             = "back.graph.redcrossquest.com"
superset_domain        = "superset.graph.redcrossquest.com"


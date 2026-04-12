project_id  = "rcq-fr-prod"
region      = "europe-west1"
environment = "prod"

# Cloud SQL connection name - update with actual instance name
cloud_sql_connection_name = "rcq-fr-prod:europe-west1:rcq-db-inst-fr-prod-0"

# Database name
rcq_db_name = "rcq_fr_prod_db"

# Container images - will be updated by CI/CD
superset_image = "europe-west1-docker.pkg.dev/rcq-fr-prod/rcq-docker/rcq-superset"
api_image      = "europe-west1-docker.pkg.dev/rcq-fr-prod/rcq-docker/rcq-api"
frontend_image = "europe-west1-docker.pkg.dev/rcq-fr-prod/rcq-docker/rcq-frontend"
# image_tag    = "latest"  # Override with specific tag during deployment

# Custom domain mappings (prod uses root domain without env prefix)
enable_domain_mappings = true
frontend_domain        = "graph.redcrossquest.com"
api_domain             = "back.graph.redcrossquest.com"
superset_domain        = "superset.graph.redcrossquest.com"


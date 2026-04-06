project_id = "rcq-fr-prod"
region     = "europe-west1"
environment = "prod"

# Cloud SQL connection name - update with actual instance name
cloud_sql_connection_name = "rcq-fr-prod:europe-west1:rcq-mysql-instance"

# Database name
rcq_db_name = "rcq_fr_prod_db"

# Container images - will be updated by CI/CD
superset_image = "apache/superset:4.1.1"
api_image      = "gcr.io/rcq-fr-prod/rcq_api:latest"
frontend_image = "gcr.io/rcq-fr-prod/rcq_frontend:latest"


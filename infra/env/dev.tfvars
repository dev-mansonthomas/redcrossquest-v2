project_id = "rcq-fr-dev"
region     = "europe-west1"
environment = "dev"

# Cloud SQL connection name - update with actual instance name
cloud_sql_connection_name = "rcq-fr-dev:europe-west1:rcq-mysql-instance"

# Database name
rcq_db_name = "rcq_fr_dev_db"

# Container images - will be updated by CI/CD
superset_image = "apache/superset:4.1.1"
api_image      = "gcr.io/rcq-fr-dev/rcq_api:latest"
frontend_image = "gcr.io/rcq-fr-dev/rcq_frontend:latest"


project_id = "rcq-fr-test"
region     = "europe-west1"
environment = "test"

# Cloud SQL connection name - update with actual instance name
cloud_sql_connection_name = "rcq-fr-test:europe-west1:rcq-mysql-instance"

# Database name
rcq_db_name = "rcq_fr_test_db"

# Container images - will be updated by CI/CD
metabase_image = "metabase/metabase:v0.48.0"
api_image      = "gcr.io/rcq-fr-test/rcq_api:latest"
frontend_image = "gcr.io/rcq-fr-test/rcq_frontend:latest"


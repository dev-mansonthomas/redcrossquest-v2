project_id  = "rcq-fr-test"
region      = "europe-west1"
environment = "test"

# Cloud SQL connection name - update with actual instance name
cloud_sql_connection_name = "rcq-fr-test:europe-west1:rcq-db-inst-fr-test-3"

# Database name
rcq_db_name = "rcq_fr_test_db"

# Container images - will be updated by CI/CD
superset_image = "europe-west1-docker.pkg.dev/rcq-fr-test/rcq-docker/rcq-superset"
api_image      = "europe-west1-docker.pkg.dev/rcq-fr-test/rcq-docker/rcq-api"
frontend_image = "europe-west1-docker.pkg.dev/rcq-fr-test/rcq-docker/rcq-frontend"
# image_tag    = "latest"  # Override with specific tag during deployment

# Superset admin
superset_admin_username   = "tom"
superset_admin_email      = "thomas.manson@croix-rouge.fr"
superset_admin_first_name = "Thomas"
superset_admin_last_name  = "Manson"

# Custom domain mappings
enable_domain_mappings = true
frontend_domain        = "test.graph.redcrossquest.com"
api_domain             = "test.back.graph.redcrossquest.com"
superset_domain        = "test.superset.graph.redcrossquest.com"

# Feature flags
enable_superset = false


-- 10-create-user-rcq-graph.sql
-- NOTE: User rcq-graph is created by gcp-deploy.sh create_db_users()
-- with the correct password from .env.{env} and proper GRANT statements.
-- This migration file is intentionally empty.
-- See gcp-deploy.sh create_db_users() for the actual user creation.
SELECT 'rcq-graph user is managed by gcp-deploy.sh create_db_users()' AS info;

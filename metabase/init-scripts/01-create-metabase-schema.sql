-- Create Metabase application database schema
-- This schema stores Metabase's own metadata (users, dashboards, queries, etc.)

CREATE DATABASE IF NOT EXISTS rcq_metabase_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Grant privileges to the Metabase user
-- Note: User is created automatically by docker-compose MYSQL_USER/MYSQL_PASSWORD
GRANT ALL PRIVILEGES ON rcq_metabase_db.* TO '${MYSQL_USER}'@'%';

FLUSH PRIVILEGES;


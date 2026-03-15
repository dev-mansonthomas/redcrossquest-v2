#!/bin/bash

# RedCrossQuest V2 - Metabase Database Setup Script
# This script creates the Metabase database schema and user with proper permissions
# 
# Security features:
# - Interactive password prompts (not stored in history)
# - No credentials hardcoded or committed
# - Disables shell history during execution
# - Supports Cloud SQL Proxy or direct connection

set -e  # Exit on error

# Disable command history for this session
set +o history

echo "=========================================="
echo "RCQ Metabase Database Setup"
echo "=========================================="
echo ""
echo "This script will create:"
echo "  - Database schema: rcq_metabase_db"
echo "  - Database user: rcq_metabase"
echo "  - Grant appropriate permissions"
echo ""

# Prompt for environment
echo "Select environment:"
echo "  1) dev (rcq-fr-dev)"
echo "  2) test (rcq-fr-test)"
echo "  3) prod (rcq-fr-prod)"
read -p "Enter choice [1-3]: " env_choice

case $env_choice in
  1)
    ENV="dev"
    PROJECT_ID="rcq-fr-dev"
    ;;
  2)
    ENV="test"
    PROJECT_ID="rcq-fr-test"
    ;;
  3)
    ENV="prod"
    PROJECT_ID="rcq-fr-prod"
    ;;
  *)
    echo "Invalid choice. Exiting."
    exit 1
    ;;
esac

echo ""
echo "Environment: $ENV ($PROJECT_ID)"
echo ""

# Prompt for connection method
echo "Select connection method:"
echo "  1) Cloud SQL Proxy (recommended for local development)"
echo "  2) Direct connection (requires IP whitelisting)"
read -p "Enter choice [1-2]: " conn_choice

case $conn_choice in
  1)
    MYSQL_HOST="127.0.0.1"
    MYSQL_PORT="3306"
    echo ""
    echo "Make sure Cloud SQL Proxy is running:"
    echo "  cloud-sql-proxy $PROJECT_ID:europe-west1:rcq-mysql-instance"
    echo ""
    read -p "Press Enter when Cloud SQL Proxy is ready..."
    ;;
  2)
    read -p "Enter MySQL host: " MYSQL_HOST
    read -p "Enter MySQL port [3306]: " MYSQL_PORT
    MYSQL_PORT=${MYSQL_PORT:-3306}
    ;;
  *)
    echo "Invalid choice. Exiting."
    exit 1
    ;;
esac

# Prompt for MySQL admin credentials
echo ""
echo "Enter MySQL admin credentials (for creating database and user):"
read -p "MySQL admin username: " MYSQL_ADMIN_USER
read -s -p "MySQL admin password: " MYSQL_ADMIN_PASSWORD
echo ""

# Prompt for Metabase user password
echo ""
echo "Enter password for the new Metabase database user (rcq_metabase):"
read -s -p "Metabase DB password: " METABASE_PASSWORD
echo ""
read -s -p "Confirm password: " METABASE_PASSWORD_CONFIRM
echo ""

if [ "$METABASE_PASSWORD" != "$METABASE_PASSWORD_CONFIRM" ]; then
  echo "Passwords do not match. Exiting."
  exit 1
fi

# Validate password is not empty
if [ -z "$METABASE_PASSWORD" ]; then
  echo "Password cannot be empty. Exiting."
  exit 1
fi

echo ""
echo "Creating database and user..."
echo ""

# Create SQL commands
SQL_COMMANDS=$(cat <<EOF
-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS rcq_metabase_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Create user if it doesn't exist
CREATE USER IF NOT EXISTS 'rcq_metabase'@'%' IDENTIFIED BY '$METABASE_PASSWORD';

-- Grant permissions
GRANT ALL PRIVILEGES ON rcq_metabase_db.* TO 'rcq_metabase'@'%';

-- Apply changes
FLUSH PRIVILEGES;

-- Show confirmation
SELECT 'Database and user created successfully' AS Status;
EOF
)

# Execute SQL commands
mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_ADMIN_USER" -p"$MYSQL_ADMIN_PASSWORD" <<< "$SQL_COMMANDS"

if [ $? -eq 0 ]; then
  echo ""
  echo "=========================================="
  echo "✓ Setup completed successfully!"
  echo "=========================================="
  echo ""
  echo "Database: rcq_metabase_db"
  echo "User: rcq_metabase"
  echo "Host: $MYSQL_HOST:$MYSQL_PORT"
  echo ""
  echo "Next steps:"
  echo "1. Store the password in Secret Manager:"
  echo "   echo -n '$METABASE_PASSWORD' | gcloud secrets versions add rcq_metabase_db_password_$ENV --data-file=-"
  echo ""
  echo "2. Store the username in Secret Manager:"
  echo "   echo -n 'rcq_metabase' | gcloud secrets versions add rcq_metabase_db_user_$ENV --data-file=-"
  echo ""
else
  echo ""
  echo "✗ Setup failed. Please check the error messages above."
  exit 1
fi

# Re-enable command history
set -o history


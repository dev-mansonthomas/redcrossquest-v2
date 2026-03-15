#!/bin/bash
# Interactive script to create a read-only MySQL user for RCQ data access
# This script prompts for credentials and does not store them in history

set -e

echo "=========================================="
echo "RCQ Metabase - Create Read-Only User"
echo "=========================================="
echo ""
echo "This script will create a read-only MySQL user for Metabase to access RCQ data."
echo "The credentials will NOT be stored in shell history."
echo ""

# Prompt for MySQL root password
echo -n "Enter MySQL root password: "
read -s MYSQL_ROOT_PASS
echo ""

# Prompt for read-only username
echo -n "Enter read-only username [rcq_readonly_user]: "
read RO_USERNAME
RO_USERNAME=${RO_USERNAME:-rcq_readonly_user}

# Prompt for read-only password
echo -n "Enter read-only user password: "
read -s RO_PASSWORD
echo ""

# Prompt for database name
echo -n "Enter RCQ database name [rcq_fr_dev_db]: "
read DB_NAME
DB_NAME=${DB_NAME:-rcq_fr_dev_db}

# Prompt for MySQL host
echo -n "Enter MySQL host [localhost]: "
read MYSQL_HOST
MYSQL_HOST=${MYSQL_HOST:-localhost}

echo ""
echo "Creating read-only user '${RO_USERNAME}' for database '${DB_NAME}'..."

# Create the read-only user and grant SELECT privileges
mysql -h "${MYSQL_HOST}" -u root -p"${MYSQL_ROOT_PASS}" <<EOF
-- Create read-only user if not exists
CREATE USER IF NOT EXISTS '${RO_USERNAME}'@'%' IDENTIFIED BY '${RO_PASSWORD}';

-- Grant SELECT privileges on RCQ database
GRANT SELECT ON ${DB_NAME}.* TO '${RO_USERNAME}'@'%';

-- Flush privileges
FLUSH PRIVILEGES;

-- Verify user creation
SELECT User, Host FROM mysql.user WHERE User = '${RO_USERNAME}';
EOF

if [ $? -eq 0 ]; then
  echo ""
  echo "✓ Read-only user '${RO_USERNAME}' created successfully!"
  echo ""
  echo "Connection details for Metabase:"
  echo "  Database Type: MySQL"
  echo "  Host: ${MYSQL_HOST}"
  echo "  Port: 3306"
  echo "  Database: ${DB_NAME}"
  echo "  Username: ${RO_USERNAME}"
  echo "  Password: [the password you entered]"
  echo ""
  echo "⚠️  IMPORTANT: Store these credentials securely (e.g., in GCP Secret Manager)"
else
  echo ""
  echo "✗ Failed to create read-only user. Please check the error messages above."
  exit 1
fi


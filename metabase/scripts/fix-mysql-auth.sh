#!/bin/bash
# Fix MySQL 8 authentication for existing users
# Migrates users from caching_sha2_password to mysql_native_password
#
# Usage: ./fix-mysql-auth.sh
# Requires: MYSQL_ROOT_PASSWORD, MB_DB_USER, MB_DB_PASS env vars (or .env file)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env if present
if [ -f "$SCRIPT_DIR/../.env" ]; then
  set -a
  source "$SCRIPT_DIR/../.env"
  set +a
fi

if [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
  echo "Error: MYSQL_ROOT_PASSWORD is not set"
  exit 1
fi

if [ -z "${MB_DB_USER:-}" ] || [ -z "${MB_DB_PASS:-}" ]; then
  echo "Error: MB_DB_USER and MB_DB_PASS must be set"
  exit 1
fi

echo "Fixing MySQL authentication plugin for existing users..."

docker exec -i rcq_mysql_dev mysql -u root -p"${MYSQL_ROOT_PASSWORD}" <<EOF
ALTER USER '${MB_DB_USER}'@'%' IDENTIFIED WITH mysql_native_password BY '${MB_DB_PASS}';
ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASSWORD}';
FLUSH PRIVILEGES;
SELECT user, host, plugin FROM mysql.user;
EOF

echo "Done! Users now use mysql_native_password."
echo "Restart Metabase to apply: docker compose restart rcq_metabase"

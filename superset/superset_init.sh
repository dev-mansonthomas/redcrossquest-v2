#!/bin/bash
set -e

echo "⏳ Waiting for Superset metadata DB to be ready..."

# Run database migrations
superset db upgrade

# Create admin user (idempotent — skips if exists)
superset fab create-admin \
    --username "${SUPERSET_ADMIN_USERNAME:-admin}" \
    --firstname "${SUPERSET_ADMIN_FIRST_NAME:-Admin}" \
    --lastname "${SUPERSET_ADMIN_LAST_NAME:-User}" \
    --email "${SUPERSET_ADMIN_EMAIL:-admin@rcq.local}" \
    --password "${SUPERSET_ADMIN_PASSWORD:-admin}" \
    || echo "Admin user already exists, skipping."

# Initialize Superset (roles, permissions)
superset init

echo "✅ Superset initialization complete."

# Start Superset web server
exec superset run -h 0.0.0.0 -p 8088 --with-threads --reload

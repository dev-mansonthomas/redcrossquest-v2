#!/bin/bash
set -e

echo "⏳ Superset initialization starting..."

# Check if we should skip init (for restarts)
if [ "${SKIP_INIT}" = "1" ]; then
    echo "⏭️  SKIP_INIT=1, skipping initialization"
    exec superset run -h 0.0.0.0 -p 8088 --with-threads --reload
fi

echo "📦 Running database migrations..."
superset db upgrade

echo "👤 Creating admin user..."
superset fab create-admin \
    --username "${SUPERSET_ADMIN_USERNAME:-admin}" \
    --firstname "${SUPERSET_ADMIN_FIRST_NAME:-Admin}" \
    --lastname "${SUPERSET_ADMIN_LAST_NAME:-User}" \
    --email "${SUPERSET_ADMIN_EMAIL:-admin@rcq.local}" \
    --password "${SUPERSET_ADMIN_PASSWORD:-admin}" \
    || echo "Admin user already exists, skipping."

echo "🔧 Initializing roles and permissions..."
superset init

echo "✅ Superset initialization complete."

exec superset run -h 0.0.0.0 -p 8088 --with-threads --reload

#!/bin/bash
set -e

SUPERSET_DB="/app/superset_home/superset.db"

echo "⏳ Superset initialization starting..."

# Check if database already exists with data
if [ -f "$SUPERSET_DB" ]; then
    DB_SIZE=$(stat -c%s "$SUPERSET_DB" 2>/dev/null || stat -f%z "$SUPERSET_DB" 2>/dev/null || echo "0")
    if [ "$DB_SIZE" -gt 100000 ]; then
        echo "✅ Existing Superset database found ($DB_SIZE bytes)"
        echo "   Skipping initialization to preserve data."
        echo "   Use FORCE_INIT=1 to force reinitialization."

        if [ "$FORCE_INIT" != "1" ]; then
            echo "🚀 Starting Superset..."
            exec superset run -h 0.0.0.0 -p 8088 --with-threads --reload
        fi
        echo "⚠️  FORCE_INIT=1 detected, reinitializing..."
    fi
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

# Start Superset web server
exec superset run -h 0.0.0.0 -p 8088 --with-threads --reload

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

echo "👤 Creating/updating admin user..."
superset fab create-admin \
    --username "${SUPERSET_ADMIN_USERNAME:-admin}" \
    --firstname "${SUPERSET_ADMIN_FIRST_NAME:-Admin}" \
    --lastname "${SUPERSET_ADMIN_LAST_NAME:-User}" \
    --email "${SUPERSET_ADMIN_EMAIL:-admin@rcq.local}" \
    --password "${SUPERSET_ADMIN_PASSWORD:-admin}" \
    || echo "Admin user may already exist."

# Force password reset in case user already existed
echo "🔑 Ensuring admin password is up to date..."
superset fab reset-password \
    --username "${SUPERSET_ADMIN_USERNAME:-admin}" \
    --password "${SUPERSET_ADMIN_PASSWORD:-admin}" \
    || python3 -c "
from superset.app import create_app
app = create_app()
with app.app_context():
    from superset.extensions import security_manager
    user = security_manager.find_user('${SUPERSET_ADMIN_USERNAME:-admin}')
    if user:
        user.password = security_manager.get_password_hash('${SUPERSET_ADMIN_PASSWORD:-admin}')
        security_manager.get_session.commit()
        print('✅ Admin password updated')
    else:
        print('⚠️  Admin user not found')
" || echo "Inline password reset failed, skipping."

echo "🔧 Initializing roles and permissions..."
superset init

echo "✅ Superset initialization complete."

exec superset run -h 0.0.0.0 -p 8088 --with-threads --reload

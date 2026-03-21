#!/bin/bash

# RCQ V2 - Local Development Environment Launcher
# This script starts the entire development stack using Docker Compose
#
# ⚠️ ATTENTION: La suppression de volumes Docker (docker volume rm)
# doit TOUJOURS avoir l'autorisation explicite de l'utilisateur.
# Impact: Perte de toutes les données MySQL (tables, users, etc.)
# Demander confirmation avant toute suppression de volume!

set -e

# Parse arguments
INIT_DB=false
for arg in "$@"; do
    case $arg in
        --init-db)
            INIT_DB=true
            shift
            ;;
    esac
done

# Load environment variables from superset/.env
if [ -f superset/.env ]; then
    export $(grep -v '^#' superset/.env | grep -v '^$' | xargs)
fi

echo "🚀 Starting RCQ V2 Development Environment..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker compose is available
if ! docker compose version > /dev/null 2>&1; then
    echo "❌ Error: 'docker compose' is not available. Please update Docker."
    exit 1
fi

# Stop any existing containers
echo "🛑 Stopping any existing containers..."
docker compose -p rcq -f docker-compose.dev.yml down 2>/dev/null || true
docker compose -p rcq -f superset/docker-compose.yml down 2>/dev/null || true

# Start infrastructure (MySQL, Superset, Valkey)
echo ""
echo "🐳 Starting infrastructure (MySQL, Superset, Valkey)..."
docker compose -p rcq -f superset/docker-compose.yml up -d --build

# Wait for MySQL
echo ""
echo "⏳ Waiting for infrastructure..."
echo -n "  MySQL: "
for i in {1..60}; do
    if docker exec rcq_mysql mysqladmin ping -h localhost -u root -p"${MYSQL_ROOT_PASSWORD}" --silent 2>/dev/null; then
        echo "✅ Ready"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "❌ Timeout"
        exit 1
    fi
    sleep 1
done

# Setup MySQL user if needed
echo "   🔧 Configuring MySQL user..."
docker exec rcq_mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e \
    "CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'%' IDENTIFIED BY '${MYSQL_PASSWORD}'; \
     GRANT SELECT ON ${MYSQL_DATABASE}.* TO '${MYSQL_USER}'@'%'; \
     FLUSH PRIVILEGES;" 2>/dev/null || true

# Initialize database if --init-db flag is passed
init_database() {
    if [ "$INIT_DB" = true ]; then
        echo ""
        echo "   🗄️  Initializing database (--init-db)..."

        # Import the main SQL dump
        if [ -f "superset/sql-imports/01-rcq_prod_2026.sql" ]; then
            echo "   📥 Importing 01-rcq_prod_2026.sql..."
            docker exec -i rcq_mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" < superset/sql-imports/01-rcq_prod_2026.sql
            echo "   ✅ Main SQL dump imported"
        fi

        # Run trigger and anonymization
        if [ -f "superset/sql-imports/02-add-trigger_and_anonymise.sql" ]; then
            echo "   📥 Running 02-add-trigger_and_anonymise.sql..."
            docker exec -i rcq_mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" < superset/sql-imports/02-add-trigger_and_anonymise.sql
            echo "   ✅ Trigger and anonymization applied"
        fi
    fi
}
init_database

# Wait for Superset
echo -n "  Superset: "
for i in {1..90}; do
    if curl -sf http://localhost:8088/health > /dev/null 2>&1; then
        echo "✅ Ready"
        break
    fi
    if [ $i -eq 90 ]; then
        echo "❌ Timeout"
        exit 1
    fi
    sleep 1
done

# Wait for Valkey
echo -n "  Valkey: "
for i in {1..30}; do
    if docker exec rcq_valkey valkey-cli ping > /dev/null 2>&1; then
        echo "✅ Ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Timeout"
        exit 1
    fi
    sleep 1
done

# Start application (Backend, Frontend)
echo ""
echo "🔨 Building and starting application..."
docker compose -p rcq -f docker-compose.dev.yml up -d --build

# Wait for Backend
echo ""
echo "⏳ Waiting for application..."
echo -n "  Backend: "
for i in {1..60}; do
    if curl -sf http://localhost:8010/health > /dev/null 2>&1; then
        echo "✅ Ready"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "❌ Timeout"
        exit 1
    fi
    sleep 1
done

# Wait for Frontend
echo -n "  Frontend: "
for i in {1..120}; do
    if curl -sf http://localhost:4210 > /dev/null 2>&1; then
        echo "✅ Ready"
        break
    fi
    if [ $i -eq 120 ]; then
        echo "⚠️  Timeout (may still be compiling)"
        break
    fi
    sleep 1
done

# Check if database has tables (simple check)
TABLE_COUNT=$(docker exec rcq_mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${MYSQL_DATABASE}';" 2>/dev/null || echo "0")

if [ "$TABLE_COUNT" = "0" ] && [ "$INIT_DB" = false ]; then
    echo ""
    echo "   ⚠️  Database is empty. Run with --init-db to initialize:"
    echo "      ./run_local.sh --init-db"
fi

echo ""
echo "✅ RCQ V2 Development Environment is running!"
echo ""
echo "📍 Services:"
echo "  - Frontend:  http://localhost:4210"
echo "  - Backend:   http://localhost:8010"
echo "  - API Docs:  http://localhost:8010/docs"
echo "  - Superset:  http://localhost:8088"
echo "  - MySQL:     localhost:3316"
echo "  - Valkey:    localhost:6389"
echo ""
echo "📝 Useful commands:"
echo "  - View app logs:    docker compose -p rcq -f docker-compose.dev.yml logs -f"
echo "  - View infra logs:  docker compose -p rcq -f superset/docker-compose.yml logs -f"
echo "  - Stop all:         docker compose -p rcq -f docker-compose.dev.yml down && docker compose -p rcq -f superset/docker-compose.yml down"
echo "  - Restart backend:  docker compose -p rcq -f docker-compose.dev.yml restart backend"
echo "  - Restart frontend: docker compose -p rcq -f docker-compose.dev.yml restart frontend"
echo ""
echo "🔄 Hot-reload is enabled for both frontend and backend"
echo ""

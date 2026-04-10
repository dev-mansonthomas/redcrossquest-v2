#!/bin/bash

# RCQ V2 - Local Development Environment Launcher
# This script starts the entire development stack using Docker Compose
#
# ⚠️ ATTENTION: La suppression de volumes Docker (docker volume rm)
# doit TOUJOURS avoir l'autorisation explicite de l'utilisateur.
# Impact: Perte de toutes les données MySQL (tables, users, etc.)
# Demander confirmation avant toute suppression de volume!

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Help ---
show_help() {
    echo "Usage: ./run_local.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  (no args)              Démarre tout l'environnement de développement"
    echo "  --init-db              Démarre + initialise la base de données"
    echo "  --restart <service>    Redémarre un service avec --force-recreate"
    echo "                         Services: backend, frontend, superset, all"
    echo "  --provision            Provisionne les dashboards Superset (create)"
    echo "  --provision --force-update  Met à jour les dashboards existants"
    echo "  --show-config          Affiche la configuration actuelle"
    echo "  --help                 Affiche cette aide"
    echo ""
    echo "Exemples:"
    echo "  ./run_local.sh                    # Démarre tout"
    echo "  ./run_local.sh --init-db          # Démarre + init DB"
    echo "  ./run_local.sh --restart backend  # Redémarre le backend (force-recreate)"
    echo "  ./run_local.sh --restart all      # Redémarre tous les services"
    echo "  ./run_local.sh --provision             # Provisionne les dashboards"
    echo "  ./run_local.sh --provision --force-update  # Force la mise à jour"
    echo "  ./run_local.sh --show-config      # Affiche la config"
}

# --- Show Config ---
show_config() {
    echo "📋 Configuration actuelle RCQ V2"
    echo ""

    # Load env from root .env
    if [ -f "$SCRIPT_DIR/.env" ]; then
        export $(grep -v '^#' "$SCRIPT_DIR/.env" | grep -v '^$' | xargs)
    fi

    echo "🔧 Backend:"
    echo "  ENVIRONMENT                    = ${ENVIRONMENT:-<non défini>}"
    echo "  RCQ_DB_HOST                    = ${RCQ_DB_HOST:-<non défini>}"
    echo "  RCQ_DB_NAME                    = ${RCQ_DB_NAME:-<non défini>}"
    echo "  SUPERSET_URL                   = ${SUPERSET_URL:-<non défini>}"
    echo "  SUPERSET_DASHBOARD_YEARLY_GOAL = ${SUPERSET_DASHBOARD_YEARLY_GOAL:-<non défini>}"
    echo "  CORS_ORIGINS                   = ${CORS_ORIGINS:-<non défini>}"

    echo ""
    echo "🐳 Superset:"
    echo "  MYSQL_DATABASE                 = ${MYSQL_DATABASE:-<non défini>}"
    echo "  MYSQL_USER                     = ${MYSQL_USER:-<non défini>}"
    echo "  MYSQL_ROOT_PASSWORD            = ${MYSQL_ROOT_PASSWORD:0:3}***"
    echo "  SUPERSET_ADMIN_USERNAME        = ${SUPERSET_ADMIN_USERNAME:-<non défini>}"
    echo "  SUPERSET_ADMIN_PASSWORD        = ${SUPERSET_ADMIN_PASSWORD:0:2}***"
    echo "  SUPERSET_CORS_ORIGINS          = ${SUPERSET_CORS_ORIGINS:-<non défini>}"

    echo ""
    echo "📍 Services URLs:"
    echo "  Frontend:  http://localhost:4210"
    echo "  Backend:   http://localhost:8010"
    echo "  API Docs:  http://localhost:8010/docs"
    echo "  Superset:  http://localhost:8088"
    echo "  MySQL:     localhost:3316"
    echo "  Valkey:    localhost:6389"
}

# --- Restart Service ---
restart_service() {
    local service="$1"

    # Load environment variables from root .env
    if [ -f "$SCRIPT_DIR/.env" ]; then
        export $(grep -v '^#' "$SCRIPT_DIR/.env" | grep -v '^$' | xargs)
    fi

    case "$service" in
        backend)
            echo "🔄 Redémarrage du backend (force-recreate)..."
            docker compose -p rcq -f docker-compose.dev.yml up -d --force-recreate backend
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
            ;;
        frontend)
            echo "🔄 Redémarrage du frontend (force-recreate)..."
            docker compose -p rcq -f docker-compose.dev.yml up -d --force-recreate frontend
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
            ;;
        superset)
            echo "🔄 Redémarrage de Superset (build + force-recreate)..."
            docker compose -p rcq -f superset/docker-compose.yml up -d --build --force-recreate superset
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
            ;;
        all)
            echo "🔄 Redémarrage de tous les services (force-recreate)..."
            docker compose -p rcq -f docker-compose.dev.yml up -d --force-recreate valkey
            docker compose -p rcq -f superset/docker-compose.yml up -d --force-recreate
            docker compose -p rcq -f docker-compose.dev.yml up -d --force-recreate
            echo "⏳ Attente des services..."
            echo -n "  Superset: "
            for i in {1..90}; do
                if curl -sf http://localhost:8088/health > /dev/null 2>&1; then
                    echo "✅ Ready"
                    break
                fi
                if [ $i -eq 90 ]; then echo "❌ Timeout"; fi
                sleep 1
            done
            echo -n "  Backend: "
            for i in {1..60}; do
                if curl -sf http://localhost:8010/health > /dev/null 2>&1; then
                    echo "✅ Ready"
                    break
                fi
                if [ $i -eq 60 ]; then echo "❌ Timeout"; fi
                sleep 1
            done
            echo -n "  Frontend: "
            for i in {1..120}; do
                if curl -sf http://localhost:4210 > /dev/null 2>&1; then
                    echo "✅ Ready"
                    break
                fi
                if [ $i -eq 120 ]; then echo "⚠️  Timeout (may still be compiling)"; fi
                sleep 1
            done
            ;;
        *)
            echo "❌ Service inconnu: $service"
            echo "   Services disponibles: backend, frontend, superset, all"
            exit 1
            ;;
    esac

    echo ""
    echo "✅ Redémarrage terminé!"
}

# --- Parse arguments ---
INIT_DB=false
PROVISION=false
FORCE_UPDATE=false
ACTION="start"  # default action
RESTART_SERVICE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --init-db)
            INIT_DB=true
            shift
            ;;
        --restart)
            ACTION="restart"
            RESTART_SERVICE="${2:-}"
            if [ -z "$RESTART_SERVICE" ]; then
                echo "❌ Erreur: --restart nécessite un nom de service"
                echo "   Usage: ./run_local.sh --restart <backend|frontend|superset|all>"
                exit 1
            fi
            shift 2
            ;;
        --provision)
            PROVISION=true
            shift
            ;;
        --force-update)
            FORCE_UPDATE=true
            shift
            ;;
        --show-config)
            ACTION="show-config"
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo "❌ Option inconnue: $1"
            echo "   Utilisez --help pour voir les options disponibles"
            exit 1
            ;;
    esac
done

# --- Execute action ---
if [ "$ACTION" = "show-config" ]; then
    show_config
    exit 0
fi

if [ "$ACTION" = "restart" ]; then
    restart_service "$RESTART_SERVICE"
    exit 0
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

# Generate component .env files from root .env
echo "📝 Generating environment files from root .env..."
"$SCRIPT_DIR/scripts/generate-env.sh" local

# Load environment variables from root .env (for use in this script)
if [ -f "$SCRIPT_DIR/.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/.env" | grep -v '^$' | xargs)
fi

# Create shared Docker network (must exist before any compose up)
# Both docker-compose.dev.yml and superset/docker-compose.yml use this as external
docker network create rcq_default 2>/dev/null || true

# Stop any existing containers
echo "🛑 Stopping any existing containers..."
docker compose -p rcq -f docker-compose.dev.yml down 2>/dev/null || true
docker compose -p rcq -f superset/docker-compose.yml down 2>/dev/null || true

# Start Valkey first (needed by Superset)
echo ""
echo "🔑 Starting Valkey (valkey-bundle)..."
docker compose -p rcq -f docker-compose.dev.yml up -d valkey

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

# Start infrastructure (MySQL, Superset)
echo ""
echo "🐳 Starting infrastructure (MySQL, Superset)..."
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

        # Import the main SQL dump (dev setup)
        if [ -f "superset/dev-sql-import/01-rcq_prod_2026.sql" ]; then
            echo "   📥 Importing 01-rcq_prod_2026.sql..."
            docker exec -i rcq_mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" < superset/dev-sql-import/01-rcq_prod_2026.sql
            echo "   ✅ Main SQL dump imported"
        fi

        # Run trigger and anonymization (dev setup)
        if [ -f "superset/dev-sql-import/02-add-trigger_and_anonymise.sql" ]; then
            echo "   📥 Running 02-add-trigger_and_anonymise.sql..."
            docker exec -i rcq_mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" < superset/dev-sql-import/02-add-trigger_and_anonymise.sql
            echo "   ✅ Trigger and anonymization applied"
        fi

        # Create quete_dates reference table and seed data (deploy migration)
        if [ -f "superset/deploy-sql/01-quete-dates.sql" ]; then
            echo "   📥 Running 01-quete-dates.sql..."
            docker exec -i rcq_mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" < superset/deploy-sql/01-quete-dates.sql
            echo "   ✅ quete_dates table created and seeded"
        fi

        # Migrate charset from utf8mb3 to utf8mb4 (deploy migration)
        if [ -f "superset/deploy-sql/02-migrate-utf8mb4.sql" ]; then
            echo "   📥 Running 02-migrate-utf8mb4.sql..."
            docker exec -i rcq_mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" < superset/deploy-sql/02-migrate-utf8mb4.sql
            echo "   ✅ Charset migrated to utf8mb4"
        fi
    fi
}
init_database

# --- Provision Dashboards ---
provision_dashboards() {
    echo ""
    echo "📊 Provisioning Superset dashboards..."

    local force_flag=""
    if [ "$FORCE_UPDATE" = true ]; then
        force_flag="--force-update"
        echo "   (mode: force-update)"
    fi

    # Run provisioning script locally (requires python3)
    if command -v python3 &> /dev/null; then
        cd superset/provisioning && python3 scripts/provision_superset.py --env local $force_flag --auto-restart --no-restart
        cd - > /dev/null
    else
        echo "❌ python3 not found. Install Python 3 to run provisioning."
        exit 1
    fi
}

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

# Provision dashboards if requested
if [ "$PROVISION" = true ]; then
    provision_dashboards
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
echo "  - View app logs:      docker compose -p rcq -f docker-compose.dev.yml logs -f"
echo "  - View infra logs:    docker compose -p rcq -f superset/docker-compose.yml logs -f"
echo "  - Stop all:           docker compose -p rcq -f docker-compose.dev.yml down && docker compose -p rcq -f superset/docker-compose.yml down"
echo "  - Restart backend:    ./run_local.sh --restart backend"
echo "  - Restart frontend:   ./run_local.sh --restart frontend"
echo "  - Restart superset:   ./run_local.sh --restart superset"
echo "  - Restart all:        ./run_local.sh --restart all"
echo "  - Provision dashboards:  ./run_local.sh --provision"
echo "  - Update dashboards:     ./run_local.sh --provision --force-update"
echo "  - Show config:        ./run_local.sh --show-config"
echo ""
echo "🔄 Hot-reload is enabled for both frontend and backend"
echo ""

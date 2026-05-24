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
    echo "  --init-db              Démarre + initialise la base de données."
    echo "                         Par défaut: déclenche un export Cloud SQL prod vers"
    echo "                         gs://rcq-fr-prod.appspot.com/, télécharge le dump"
    echo "                         dans superset/dev-sql-import/prod-data/, puis"
    echo "                         importe le fichier *-RCQ-FR-PROD.sql le plus récent."
    echo "  --use-last-export      (avec --init-db) Skip l'export Cloud SQL : prend le"
    echo "                         dump le plus récent déjà présent dans le bucket GCS."
    echo "  --restart <service>    Redémarre un service avec --force-recreate"
    echo "                         Services: backend, frontend, superset, all"
    echo "  --provision            Provisionne les dashboards Superset (create)"
    echo "  --provision --force-update  Met à jour les dashboards existants"
    echo "  --show-config          Affiche la configuration actuelle"
    echo "  --superset             Démarre aussi Superset (désactivé par défaut)"
    echo "  --help                 Affiche cette aide"
    echo ""
    echo "Exemples:"
    echo "  ./run_local.sh                              # Démarre tout"
    echo "  ./run_local.sh --init-db                    # Export prod + init DB"
    echo "  ./run_local.sh --init-db --use-last-export  # Init DB depuis dernier dump GCS"
    echo "  ./run_local.sh --restart backend            # Redémarre le backend"
    echo "  ./run_local.sh --restart all                # Redémarre tous les services"
    echo "  ./run_local.sh --provision                  # Provisionne les dashboards"
    echo "  ./run_local.sh --provision --force-update   # Force la mise à jour"
    echo "  ./run_local.sh --show-config                # Affiche la config"
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
            docker compose -p rcq -f superset/docker-compose.yml --profile superset up -d --build --force-recreate superset
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
            docker compose -p rcq -f superset/docker-compose.yml --profile superset up -d --force-recreate
            docker compose -p rcq -f docker-compose.dev.yml up -d --force-recreate
            echo "⏳ Attente des services..."
            if [ "$ENABLE_SUPERSET" = true ]; then
                echo -n "  Superset: "
                for i in {1..90}; do
                    if curl -sf http://localhost:8088/health > /dev/null 2>&1; then
                        echo "✅ Ready"
                        break
                    fi
                    if [ $i -eq 90 ]; then echo "❌ Timeout"; fi
                    sleep 1
                done
            fi
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
USE_LAST_EXPORT=false
PROVISION=false
FORCE_UPDATE=false
ENABLE_SUPERSET=false
ACTION="start"  # default action
RESTART_SERVICE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --init-db)
            INIT_DB=true
            shift
            ;;
        --use-last-export)
            USE_LAST_EXPORT=true
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
        --superset)
            ENABLE_SUPERSET=true
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
docker compose -p rcq -f superset/docker-compose.yml --profile superset down 2>/dev/null || true

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
if [ "$ENABLE_SUPERSET" = true ]; then
  echo "🐳 Starting infrastructure (MySQL, Superset)..."
  docker compose -p rcq -f superset/docker-compose.yml --profile superset up -d --build
else
  echo "🐳 Starting infrastructure (MySQL)..."
  # Start only MySQL (no Superset)
  docker compose -p rcq -f superset/docker-compose.yml up -d --build mysql
fi

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

# Setup MySQL users
echo "   🔧 Configuring MySQL users..."
# 1. rcq_readonly — Superset (SELECT only)
docker exec rcq_mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e \
    "CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'%' IDENTIFIED BY '${MYSQL_PASSWORD}'; \
     GRANT SELECT ON ${MYSQL_DATABASE}.* TO '${MYSQL_USER}'@'%'; \
     FLUSH PRIVILEGES;" 2>/dev/null || true
# 2. rcq-graph — Backend (SELECT + targeted UPDATE)
docker exec rcq_mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e \
    "CREATE USER IF NOT EXISTS '${RCQ_DB_USER}'@'%' IDENTIFIED BY '${RCQ_DB_PASSWORD}'; \
     GRANT SELECT ON ${MYSQL_DATABASE}.* TO '${RCQ_DB_USER}'@'%'; \
     GRANT UPDATE ON ${MYSQL_DATABASE}.queteur_mailing_status TO '${RCQ_DB_USER}'@'%'; \
     GRANT UPDATE ON ${MYSQL_DATABASE}.ul_settings TO '${RCQ_DB_USER}'@'%'; \
     FLUSH PRIVILEGES;" 2>/dev/null || true

# --- Export Prod Dump ---
# Triggers a Cloud SQL export of the prod database to GCS, then downloads the
# resulting dump locally. With --use-last-export, skips the export and picks
# the most recent existing object in the bucket instead. RCQ_DB_NAME is read
# from .env.prod in a subshell so it does not pollute the local environment.
export_prod_dump() {
    local env_file="$SCRIPT_DIR/.env.prod"
    local bucket="gs://rcq-fr-prod.appspot.com"
    local instance="rcq-db-inst-fr-prod-0"
    local project="rcq-fr-prod"
    local target_dir="superset/dev-sql-import/prod-data"

    echo ""
    echo "   🔍 Pre-flight checks (gcloud / gsutil / auth)..."

    if ! command -v gcloud >/dev/null 2>&1; then
        echo "❌ Erreur: gcloud introuvable dans le PATH. Installe le Google Cloud SDK."
        exit 1
    fi
    if ! command -v gsutil >/dev/null 2>&1; then
        echo "❌ Erreur: gsutil introuvable dans le PATH. Installe le Google Cloud SDK."
        exit 1
    fi

    local active_account
    active_account=$(gcloud auth list --filter=status:ACTIVE --format='value(account)')
    if [ -z "$active_account" ]; then
        echo "❌ Erreur: aucun compte gcloud actif. Lance 'gcloud auth login'."
        exit 1
    fi
    echo "   ✅ gcloud compte actif: $active_account"

    local current_project
    current_project=$(gcloud config get-value project 2>/dev/null || echo "")
    echo "   ℹ️  gcloud project courant: ${current_project:-<non défini>} (export forcé sur $project)"

    if [ ! -f "$env_file" ]; then
        echo "❌ Erreur: $env_file introuvable. RCQ_DB_NAME requis pour l'export prod."
        exit 1
    fi
    local rcq_db_name
    rcq_db_name=$(grep -E '^RCQ_DB_NAME=' "$env_file" | head -1 | cut -d= -f2-)
    rcq_db_name="${rcq_db_name%\"}"
    rcq_db_name="${rcq_db_name#\"}"
    rcq_db_name="${rcq_db_name%\'}"
    rcq_db_name="${rcq_db_name#\'}"
    if [ -z "$rcq_db_name" ]; then
        echo "❌ Erreur: RCQ_DB_NAME vide ou absent dans $env_file"
        exit 1
    fi
    echo "   ✅ RCQ_DB_NAME=$rcq_db_name (lu depuis .env.prod)"

    mkdir -p "$target_dir"

    local gcs_uri
    if [ "$USE_LAST_EXPORT" = true ]; then
        echo ""
        echo "   📤 --use-last-export: skip export, recherche du dump le plus récent dans $bucket..."
        gcs_uri=$(gsutil ls "$bucket/*-RCQ-FR-PROD.sql" 2>/dev/null | sort -r | head -1)
        if [ -z "$gcs_uri" ]; then
            echo "❌ Erreur: aucun dump *-RCQ-FR-PROD.sql trouvé dans $bucket"
            exit 1
        fi
        echo "   ✅ Dump sélectionné: $gcs_uri"
    else
        local dump_date
        dump_date=$(date +%Y-%m-%d)
        gcs_uri="$bucket/${dump_date}-RCQ-FR-PROD.sql"
        echo ""
        echo "   📤 Export Cloud SQL → $gcs_uri (database=$rcq_db_name, instance=$instance)..."
        gcloud sql export sql "$instance" "$gcs_uri" \
            --database="$rcq_db_name" \
            --project="$project"
        echo "   ✅ Export Cloud SQL terminé"
    fi

    echo ""
    echo "   📥 Téléchargement local → $target_dir/..."
    gsutil cp "$gcs_uri" "$target_dir/"
    echo "   ✅ Dump téléchargé"
}

# Initialize database if --init-db flag is passed
init_database() {
    if [ "$INIT_DB" = true ]; then
        echo ""
        echo "   🗄️  Initializing database (--init-db)..."

        # Export prod DB to GCS + download locally (before any import)
        export_prod_dump

        # Import the most recent prod dump from prod-data/
        local latest_dump
        # shellcheck disable=SC2012
        latest_dump=$(ls -t superset/dev-sql-import/prod-data/*-RCQ-FR-PROD.sql 2>/dev/null | head -1)
        if [ -z "$latest_dump" ]; then
            echo "❌ Erreur: aucun dump *-RCQ-FR-PROD.sql trouvé dans superset/dev-sql-import/prod-data/"
            exit 1
        fi

        # The Cloud SQL dump contains `CREATE DATABASE` + `USE` statements
        # pinned to the prod schema name (RCQ_DB_NAME from .env.prod), so
        # piping it straight into mysql would create/populate that schema
        # instead of the local ${MYSQL_DATABASE}. Rewrite the backticked
        # schema name on the fly via sed before sending to mysql.
        local prod_db_name
        prod_db_name=$(grep -E '^RCQ_DB_NAME=' "$SCRIPT_DIR/.env.prod" | head -1 | cut -d= -f2-)
        prod_db_name="${prod_db_name%\"}"
        prod_db_name="${prod_db_name#\"}"
        prod_db_name="${prod_db_name%\'}"
        prod_db_name="${prod_db_name#\'}"
        if [ -z "$prod_db_name" ]; then
            echo "❌ Erreur: RCQ_DB_NAME vide ou absent dans $SCRIPT_DIR/.env.prod (requis pour le rename de schéma)"
            exit 1
        fi

        echo "   📥 Importing $latest_dump..."
        echo "   🔄 Renaming schema in dump: ${prod_db_name} → ${MYSQL_DATABASE}"
        # Scope pipefail to this subshell so a sed/mysql failure mid-pipe
        # propagates under set -e (parent shell doesn't have pipefail set).
        (
            set -o pipefail
            sed -E "s/\`${prod_db_name}\`/\`${MYSQL_DATABASE}\`/g" "$latest_dump" \
                | docker exec -i rcq_mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}"
        )
        echo "   ✅ Main SQL dump imported"

        # Run trigger (dev setup)
        if [ -f "superset/dev-sql-import/02-add-trigger.sql" ]; then
            echo "   📥 Running 02-add-trigger.sql..."
            docker exec -i rcq_mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" < superset/dev-sql-import/02-add-trigger.sql
            echo "   ✅ Trigger applied"
        fi
        # Anonymise sensitive data (dev setup)
        if [ -f "superset/dev-sql-import/03-anonymise.sql" ]; then
            echo "   📥 Running 03-anonymise.sql..."
            docker exec -i rcq_mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" < superset/dev-sql-import/03-anonymise.sql
            echo "   ✅ Data anonymised"
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
if [ "$ENABLE_SUPERSET" = true ]; then
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
fi

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
if [ "$ENABLE_SUPERSET" = true ]; then
echo "  - Superset:  http://localhost:8088"
fi
echo "  - MySQL:     localhost:3316"
echo "  - Valkey:    localhost:6389"
echo ""
echo "📝 Useful commands:"
echo "  - View app logs:      docker compose -p rcq -f docker-compose.dev.yml logs -f"
echo "  - View infra logs:    docker compose -p rcq -f superset/docker-compose.yml logs -f"
echo "  - Stop all:           docker compose -p rcq -f docker-compose.dev.yml down && docker compose -p rcq -f superset/docker-compose.yml down"
echo "  - Restart backend:    ./run_local.sh --restart backend"
echo "  - Restart frontend:   ./run_local.sh --restart frontend"
if [ "$ENABLE_SUPERSET" = true ]; then
echo "  - Restart superset:   ./run_local.sh --restart superset"
fi
echo "  - Restart all:        ./run_local.sh --restart all"
if [ "$ENABLE_SUPERSET" = true ]; then
echo "  - Provision dashboards:  ./run_local.sh --provision"
echo "  - Update dashboards:     ./run_local.sh --provision --force-update"
fi
echo "  - Show config:        ./run_local.sh --show-config"
echo ""
echo "🔄 Hot-reload is enabled for both frontend and backend"
if [ "$ENABLE_SUPERSET" != true ]; then
echo "  💡 Astuce: ./run_local.sh --superset pour activer Superset"
fi
echo ""

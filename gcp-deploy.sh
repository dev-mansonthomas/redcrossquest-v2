#!/usr/bin/env bash
# ============================================================
# gcp-deploy.sh — GCP deployment script for RedCrossQuest V2
#
# Configuration:  .env.{env}  (single file per environment)
# Template:       .env.example
#
# Usage:
#   ./gcp-deploy.sh <env> [options]
#   env: dev | test | prod
#
# Options:
#   --build          Build and push Docker images (standalone)
#   --infra          Apply Terraform (auto-builds images first)
#   --skip-build     Skip the automatic build in --infra
#   --migrate        Run SQL migrations
#   --provision      Provision Superset dashboards
#   --check          Check environment readiness (DB user, secrets, etc.)
#   --all            Do everything (build + infra + migrate + provision)
#   --plan           Terraform plan only (dry run, no build)
#   --services LIST  Comma-separated list of services to build (frontend,api,superset)
#                    Default: all services. Only affects build step.
#   --superset         Include Superset in build/deploy (disabled by default)
#   --destroy-superset Destroy Superset resources (2-step: disable protection + destroy, keeps Valkey)
#   --dump-prod      Dump production DB to SQL file (prod only)
#   --copy-prod      Copy latest prod dump into dev/test DB
#   --skip-confirm   Skip confirmation prompts
#   --no-cache        Force Docker build without cache
#   --help           Show this help message
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}ℹ️  $*${NC}"; }
log_success() { echo -e "${GREEN}✅ $*${NC}"; }
log_warn()    { echo -e "${YELLOW}⚠️  $*${NC}"; }
log_error()   { echo -e "${RED}❌ $*${NC}"; }

# ── Help ────────────────────────────────────────────────────
show_help() {
    cat <<'EOF'
Usage: ./gcp-deploy.sh <env> [options]

RedCrossQuest V2 — GCP deployment script.

Configuration:
  Each environment reads from a single file: .env.<env>
  Template: .env.example (copy and fill in values)

  cp .env.example .env.dev    # then edit .env.dev
  cp .env.example .env.test
  cp .env.example .env.prod

Environments:
  dev       Development environment
  test      Test/staging environment
  prod      Production environment

Secret Manager:
  Each GCP project has its own Secret Manager. Secrets use a fixed name
  (e.g., rcq_db_readonly_password) without environment suffix.
  For local development, secrets are prefixed with "local-"
  (e.g., local-rcq_db_readonly_password).

Options:
  --build          Build and push Docker images (standalone, without infra)
  --infra          Apply Terraform infrastructure changes (auto-builds images first)
  --skip-build     Skip the automatic Docker build in --infra
  --migrate        Run SQL migrations via scripts/run-migrations.sh
  --provision      Provision Superset dashboards
  --check          Check environment readiness (DB user, secrets, etc.)
  --all            Run all steps: build + infra + migrate + provision
  --plan           Terraform plan only (dry run, no build, no apply)
  --services LIST  Comma-separated list of services to build (frontend,api,superset)
                   Default: all services. Only affects build step.
  --superset         Include Superset in build/deploy (disabled by default)
  --destroy-superset Destroy Superset resources (2-step: disable protection + destroy, keeps Valkey)
  --dump-prod      Dump production database to a SQL file (ENV=prod only)
  --copy-prod      Copy latest prod dump into dev/test DB (ENV=dev|test only)
  --no-cache        Force Docker build without cache
  --skip-confirm   Skip confirmation prompts
  --help           Show this help message

Examples:
  ./gcp-deploy.sh dev --plan                  # Dry run: show Terraform plan
  ./gcp-deploy.sh dev --build                 # Build and push Docker images only
  ./gcp-deploy.sh dev --infra                 # Build images + apply infrastructure
  ./gcp-deploy.sh dev --infra --superset      # Build + infra including Superset
  ./gcp-deploy.sh dev --infra --skip-build    # Apply infrastructure without building
  ./gcp-deploy.sh dev --migrate               # Run database migrations
  ./gcp-deploy.sh dev --all                   # Full deployment (without Superset)
  ./gcp-deploy.sh dev --all --superset        # Full deployment including Superset
  ./gcp-deploy.sh dev --build --superset      # Build frontend + api + superset
  ./gcp-deploy.sh dev --infra --services frontend,api  # Build only frontend+api
  ./gcp-deploy.sh dev --destroy-superset      # Destroy Superset resources
  ./gcp-deploy.sh prod --all --skip-confirm            # Full prod deploy, no prompts
  ./gcp-deploy.sh prod --dump-prod                     # Dump prod DB to SQL file
  ./gcp-deploy.sh dev --copy-prod                      # Import latest prod dump into dev
EOF
    exit 0
}

# ── Argument parsing ────────────────────────────────────────
if [ $# -eq 0 ]; then
    show_help
fi

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    show_help
fi

ENV="$1"
shift

case "$ENV" in
    dev|test|prod) ;;
    *)
        log_error "Unknown environment: $ENV (expected: dev, test, prod)"
        exit 1
        ;;
esac

DO_BUILD=false
DO_INFRA=false
DO_MIGRATE=false
DO_PROVISION=false
DO_CHECK=false
PLAN_ONLY=false
SKIP_CONFIRM=false
SKIP_BUILD=false
BUILD_DONE=false
DO_DUMP_PROD=false
DO_COPY_PROD=false
NO_CACHE=false
ENABLE_SUPERSET=false
DESTROY_SUPERSET=false
SERVICES=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --build)       DO_BUILD=true;     shift ;;
        --infra)       DO_INFRA=true;     shift ;;
        --skip-build)  SKIP_BUILD=true;   shift ;;
        --migrate)     DO_MIGRATE=true;   shift ;;
        --provision)   DO_PROVISION=true; shift ;;
        --check)       DO_CHECK=true;     shift ;;
        --all)
            DO_BUILD=true
            DO_INFRA=true
            DO_MIGRATE=true
            DO_PROVISION=true
            shift
            ;;
        --superset)    ENABLE_SUPERSET=true; shift ;;
        --destroy-superset) DESTROY_SUPERSET=true; shift ;;
        --services)    SERVICES="$2";   shift 2 ;;
        --plan)        PLAN_ONLY=true; DO_INFRA=true; shift ;;
        --dump-prod)   DO_DUMP_PROD=true; shift ;;
        --copy-prod)   DO_COPY_PROD=true; shift ;;
        --no-cache)    NO_CACHE=true;     shift ;;
        --skip-confirm) SKIP_CONFIRM=true; shift ;;
        --help|-h)     show_help ;;
        *)
            log_error "Unknown option: $1"
            echo "Run './gcp-deploy.sh --help' for usage."
            exit 1
            ;;
    esac
done

# Default: build frontend + api (superset excluded unless --superset)
if [ -z "$SERVICES" ]; then
    if $ENABLE_SUPERSET; then
        SERVICES="frontend,api,superset"
    else
        SERVICES="frontend,api"
    fi
fi

# Validate --superset / --destroy-superset incompatibility
if $ENABLE_SUPERSET && $DESTROY_SUPERSET; then
    log_error "Flags --superset and --destroy-superset are mutually exclusive."
    exit 1
fi

if ! $DO_BUILD && ! $DO_INFRA && ! $DO_MIGRATE && ! $DO_PROVISION && ! $DO_CHECK && ! $DO_DUMP_PROD && ! $DO_COPY_PROD && ! $DESTROY_SUPERSET; then
    log_error "No action specified. Use --build, --infra, --migrate, --provision, --check, --dump-prod, --copy-prod, --all, --plan, or --destroy-superset."
    echo "Run './gcp-deploy.sh --help' for usage."
    exit 1
fi

# Validate --dump-prod / --copy-prod environment constraints
if $DO_DUMP_PROD && [ "$ENV" != "prod" ]; then
    log_error "--dump-prod can only be used with ENV=prod"
    exit 1
fi
if $DO_COPY_PROD && [ "$ENV" = "prod" ]; then
    log_error "--copy-prod cannot be used with ENV=prod (use dev or test)"
    exit 1
fi

# ── Load .env file ──────────────────────────────────────────
ENV_FILE="$SCRIPT_DIR/.env.${ENV}"
if [ ! -f "$ENV_FILE" ]; then
    log_error "Configuration file not found: $ENV_FILE"
    echo ""
    echo "Create it from the template:"
    echo "  cp .env.example .env.${ENV}"
    echo "  \$EDITOR .env.${ENV}"
    exit 1
fi

log_info "Loading configuration from $ENV_FILE"

# Source env file (skip comments and blank lines)
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# ── Validate required variables ─────────────────────────────
require_var() {
    local var_name="$1"
    local context="${2:-}"
    if [ -z "${!var_name:-}" ]; then
        log_error "Missing required variable: $var_name${context:+ (needed for $context)}"
        exit 1
    fi
}

# Always required
require_var GCP_PROJECT_ID
GCP_REGION="${GCP_REGION:-europe-west1}"
AR_REPOSITORY="${AR_REPOSITORY:-rcq-docker}"

# ── Derived variables ──────────────────────────────────────
GIT_SHA_SHORT="$(git -C "$SCRIPT_DIR" rev-parse --short HEAD)"
IMAGE_TAG="${ENV}-${GIT_SHA_SHORT}"
REGISTRY="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPOSITORY}"

# Terraform vars file (still used for infra)
TFVARS_FILE="$SCRIPT_DIR/infra/env/${ENV}.tfvars"

# ── Cloud SQL Proxy ───────────────────────────────────────────
CLOUD_SQL_PROXY_PID=""

cleanup_cloud_sql_proxy() {
    if [ -n "$CLOUD_SQL_PROXY_PID" ]; then
        log_info "Stopping Cloud SQL Proxy (PID $CLOUD_SQL_PROXY_PID)..."
        kill "$CLOUD_SQL_PROXY_PID" 2>/dev/null || true
        wait "$CLOUD_SQL_PROXY_PID" 2>/dev/null || true
        CLOUD_SQL_PROXY_PID=""
        log_success "Cloud SQL Proxy stopped."
    fi
}

trap cleanup_cloud_sql_proxy EXIT

ensure_cloud_sql_proxy() {
    require_var CLOUD_SQL_CONNECTION_NAME "Cloud SQL Proxy"

    local proxy_port="${CLOUD_SQL_PROXY_PORT:-3305}"

    # Check if proxy or port already in use
    if pgrep -f "cloud-sql-proxy.*${CLOUD_SQL_CONNECTION_NAME}" >/dev/null 2>&1; then
        log_info "Cloud SQL Proxy already running (detected by process)"
        return
    fi

    if nc -z 127.0.0.1 "${proxy_port}" 2>/dev/null; then
        log_info "Port ${proxy_port} already in use — assuming Cloud SQL Proxy is running externally"
        return
    fi

    log_info "Starting Cloud SQL Proxy for ${CLOUD_SQL_CONNECTION_NAME} on port ${proxy_port}..."

    if ! command -v cloud-sql-proxy &>/dev/null; then
        log_error "cloud-sql-proxy is not installed or not in PATH"
        log_info "Install: https://cloud.google.com/sql/docs/mysql/connect-auth-proxy#install"
        exit 1
    fi

    cloud-sql-proxy "${CLOUD_SQL_CONNECTION_NAME}" --port "${proxy_port}" &
    CLOUD_SQL_PROXY_PID=$!

    sleep 2

    if ! kill -0 "$CLOUD_SQL_PROXY_PID" 2>/dev/null; then
        log_error "Cloud SQL Proxy failed to start"
        CLOUD_SQL_PROXY_PID=""
        exit 1
    fi

    log_success "Cloud SQL Proxy started (PID $CLOUD_SQL_PROXY_PID) on port ${proxy_port}"
}

# ── Validation ──────────────────────────────────────────────
validate_prerequisites() {
    log_info "Validating prerequisites..."
    local missing=false

    for cmd in gcloud docker git; do
        if ! command -v "$cmd" &>/dev/null; then
            log_error "$cmd is not installed or not in PATH"
            missing=true
        fi
    done

    if $DO_INFRA; then
        if ! command -v terraform &>/dev/null; then
            log_error "terraform is not installed or not in PATH (required for --infra)"
            missing=true
        fi
        if [ ! -f "$TFVARS_FILE" ]; then
            log_error "Terraform vars file not found: $TFVARS_FILE"
            missing=true
        fi
    fi

    if $DO_PROVISION; then
        if ! command -v python3 &>/dev/null; then
            log_error "python3 is not installed or not in PATH (required for --provision)"
            missing=true
        fi
    fi

    if $missing; then
        exit 1
    fi

    log_success "All prerequisites found."
}

validate_prerequisites

# ── Enable required GCP APIs ─────────────────────────────────
enable_apis() {
    log_info "Enabling required GCP APIs..."

    local apis=(
        "run.googleapis.com"
        "artifactregistry.googleapis.com"
        "secretmanager.googleapis.com"
        "sqladmin.googleapis.com"
        "memorystore.googleapis.com"
    )

    for api in "${apis[@]}"; do
        gcloud services enable "$api" --project="$GCP_PROJECT_ID" --quiet 2>/dev/null || true
    done

    log_success "Required APIs enabled."
}

if $DO_BUILD || $DO_INFRA || $DESTROY_SUPERSET; then
    enable_apis
fi

# ── Confirmation ────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo "  RedCrossQuest V2 — GCP Deployment"
echo "═══════════════════════════════════════════════"
echo ""
echo "  Environment:  $ENV"
echo "  Project:      $GCP_PROJECT_ID"
echo "  Region:       $GCP_REGION"
echo "  Image tag:    $IMAGE_TAG"
echo "  Registry:     $REGISTRY"
echo "  Config:       $ENV_FILE"
echo "  Services:     $SERVICES"
$ENABLE_SUPERSET && echo "  Superset:     ✅ included"
$DESTROY_SUPERSET && echo "  Superset:     🗑️  DESTROY mode"
$NO_CACHE && echo "    ⚠️  Docker build: no-cache (forced clean build)"
echo ""
echo "  Steps:"
$DO_CHECK    && echo "    ✦ Check environment readiness"
$DO_BUILD    && echo "    ✦ Build & push Docker images"
$DO_INFRA    && { $PLAN_ONLY && echo "    ✦ Terraform plan (dry run)" || { ! $SKIP_BUILD && echo "    ✦ Build & push Docker images (auto)"; echo "    ✦ Terraform apply"; }; }
$DO_MIGRATE  && echo "    ✦ Run SQL migrations"
$DO_PROVISION && echo "    ✦ Provision Superset dashboards"
$DESTROY_SUPERSET && echo "    ✦ 🗑️  Destroy Superset resources"
if $DO_DUMP_PROD; then
    _dump_proxy_port="${CLOUD_SQL_PROXY_PORT:-3305}"
    _dump_dest_dir="$SCRIPT_DIR/superset/dev-sql-import/prod-data"
    echo "    ✦ Dump production database"
    echo "      🗄️  Base source : ${MIGRATION_DB_NAME:-<MIGRATION_DB_NAME not set>}"
    echo "      📂 Destination : ${_dump_dest_dir}"
    echo "      🔌 Cloud SQL   : ${CLOUD_SQL_CONNECTION_NAME:-<not set>} (port ${_dump_proxy_port})"
fi
if $DO_COPY_PROD; then
    _copy_proxy_port="${CLOUD_SQL_PROXY_PORT:-3305}"
    _copy_dump_dir="$SCRIPT_DIR/superset/dev-sql-import/prod-data"
    _copy_dump_file=""
    _copy_dump_size=""
    if [ -d "$_copy_dump_dir" ]; then
        _copy_dump_file=$(ls -t "$_copy_dump_dir"/*-RCQ-FR-PROD-data.sql 2>/dev/null | head -1)
    fi
    if [ -n "$_copy_dump_file" ]; then
        _copy_dump_size=$(du -h "$_copy_dump_file" | cut -f1)
    fi
    echo "    ✦ Copy production data to ${ENV}"
    if [ -n "$_copy_dump_file" ]; then
        echo "      📄 Dump        : $(basename "$_copy_dump_file") (${_copy_dump_size})"
    else
        echo "      📄 Dump        : <aucun fichier trouvé dans prod-data/>"
    fi
    echo "      🗄️  Base cible  : ${MIGRATION_DB_NAME:-<MIGRATION_DB_NAME not set>}"
    echo "      🔌 Cloud SQL   : ${CLOUD_SQL_CONNECTION_NAME:-<not set>} (port ${_copy_proxy_port})"
    echo "      📋 Étapes      : DROP DB → Import dump (sed rename) → Anonymisation → Migrations"
fi
echo ""
if [ -f "$TFVARS_FILE" ]; then
    echo "  🌐 DNS CNAME records required (add to redcrossquest.com zone):"
    echo ""
    FRONTEND_DOMAIN="$(grep -E '^frontend_domain' "$TFVARS_FILE" | sed 's/.*=[[:space:]]*"\(.*\)"/\1/')"
    API_DOMAIN="$(grep -E '^api_domain' "$TFVARS_FILE" | sed 's/.*=[[:space:]]*"\(.*\)"/\1/')"
    SUPERSET_DOMAIN="$(grep -E '^superset_domain' "$TFVARS_FILE" | sed 's/.*=[[:space:]]*"\(.*\)"/\1/')"
    printf "    %-25s  3600  IN  CNAME  ghs.googlehosted.com.\n" "${FRONTEND_DOMAIN%.redcrossquest.com}"
    printf "    %-25s  3600  IN  CNAME  ghs.googlehosted.com.\n" "${API_DOMAIN%.redcrossquest.com}"
    printf "    %-25s  3600  IN  CNAME  ghs.googlehosted.com.\n" "${SUPERSET_DOMAIN%.redcrossquest.com}"
    echo ""
fi

# Skip confirmation for --check (read-only mode), --dump-prod/--copy-prod (have their own prompts), or --skip-confirm
if ! $SKIP_CONFIRM && ! ($DO_CHECK && ! $DO_BUILD && ! $DO_INFRA && ! $DO_MIGRATE && ! $DO_PROVISION && ! $DO_DUMP_PROD && ! $DO_COPY_PROD && ! $DESTROY_SUPERSET); then
    if [ "$ENV" = "prod" ]; then
        echo -e "${RED}⚠️  WARNING: You are deploying to PRODUCTION!${NC}"
        echo ""
    fi
    read -r -p "Continue? [y/N] " response
    case "$response" in
        [yY][eE][sS]|[yY]) ;;
        *)
            echo "Aborted."
            exit 0
            ;;
    esac
    echo ""
fi


# ── Ensure GCS bucket for Terraform state ────────────────────
ensure_tf_bucket() {
    local BUCKET_NAME="rcq-terraform-state-${ENV}"
    if ! gcloud storage buckets describe "gs://${BUCKET_NAME}" &>/dev/null; then
        log_info "Creating GCS bucket gs://${BUCKET_NAME} for Terraform state..."
        gcloud storage buckets create "gs://${BUCKET_NAME}" \
            --location="${GCP_REGION}" \
            --uniform-bucket-level-access \
            --project="${GCP_PROJECT_ID}"
        log_success "Bucket gs://${BUCKET_NAME} created"
    else
        log_success "Bucket gs://${BUCKET_NAME} already exists"
    fi
}

# ── Ensure Artifact Registry repository exists ────────────────
ensure_ar_repository() {
    if gcloud artifacts repositories describe "${AR_REPOSITORY}" \
        --location="${GCP_REGION}" --project="${GCP_PROJECT_ID}" &>/dev/null; then
        log_success "Artifact Registry repository ${AR_REPOSITORY} already exists"
    else
        log_info "Creating Artifact Registry repository ${AR_REPOSITORY}..."
        gcloud artifacts repositories create "${AR_REPOSITORY}" \
            --repository-format=docker \
            --location="${GCP_REGION}" \
            --project="${GCP_PROJECT_ID}" \
            --labels="app=rcq,managed-by=terraform"
        log_success "Repository ${AR_REPOSITORY} created"

        # Import into Terraform state so 'terraform apply' won't try to recreate it
        local tf_dir="$SCRIPT_DIR/infra"
        local repo_location="${GCP_REGION}"
        local repo_name="${AR_REPOSITORY}"
        local tf_resource_id="projects/${GCP_PROJECT_ID}/locations/${repo_location}/repositories/${repo_name}"

        if ! command -v terraform &>/dev/null; then
            log_warning "Terraform not installed — skipping import. You may need to run: terraform import google_artifact_registry_repository.docker $tf_resource_id"
        else
            # Ensure terraform is initialized (needed when running --build without --infra)
            if [ ! -d "$tf_dir/.terraform" ]; then
                log_info "Terraform not initialized — running terraform init..."
                (cd "$tf_dir" && terraform init -backend-config="bucket=rcq-terraform-state-${ENV}" -input=false -reconfigure) || \
                    log_warning "Terraform init failed — skipping import. You may need to run: terraform import google_artifact_registry_repository.docker $tf_resource_id"
            fi

            if [ -d "$tf_dir/.terraform" ]; then
                log_info "Importing repository into Terraform state..."
                (cd "$tf_dir" && terraform import -var-file="env/${ENV}.tfvars" google_artifact_registry_repository.docker "$tf_resource_id") && \
                    log_success "Repository imported into Terraform state" || \
                    log_info "Could not import into Terraform state — you may need to run: terraform import google_artifact_registry_repository.docker $tf_resource_id"
            fi
        fi
    fi
}

# ══════════════════════════════════════════════════════════════
# Step 0: Check environment readiness
# ══════════════════════════════════════════════════════════════
check_environment() {
    local checks_passed=0
    local checks_total=0

    check_ok() {
        checks_passed=$((checks_passed + 1))
        checks_total=$((checks_total + 1))
        log_success "$1"
    }
    check_fail() {
        checks_total=$((checks_total + 1))
        log_error "$1"
    }

    echo ""
    echo "═══════════════════════════════════════════════"
    echo "  Environment Check Results"
    echo "═══════════════════════════════════════════════"
    echo ""

    # ── GCP Project ──────────────────────────────────────────
    echo "  GCP Project"
    if gcloud projects describe "$GCP_PROJECT_ID" --format="value(projectId)" 2>/dev/null | grep -q .; then
        check_ok "  Project $GCP_PROJECT_ID accessible"
    else
        check_fail "  Project $GCP_PROJECT_ID NOT accessible"
    fi
    echo ""

    # ── GCS Bucket (Terraform state) ─────────────────────────
    local tf_bucket="rcq-terraform-state-${ENV}"
    echo "  GCS Bucket (Terraform state)"
    if gcloud storage buckets describe "gs://${tf_bucket}" 2>/dev/null | grep -q .; then
        check_ok "  Bucket ${tf_bucket} exists"
    else
        check_fail "  Bucket ${tf_bucket} does NOT exist — will be created during --infra"
    fi
    echo ""

    # ── APIs ─────────────────────────────────────────────────
    echo "  APIs"
    local required_apis=(
        "run.googleapis.com"
        "artifactregistry.googleapis.com"
        "sqladmin.googleapis.com"
        "memorystore.googleapis.com"
        "secretmanager.googleapis.com"
        "cloudresourcemanager.googleapis.com"
    )
    local enabled_apis
    enabled_apis=$(gcloud services list --enabled --project="$GCP_PROJECT_ID" --format="value(config.name)" 2>/dev/null || true)

    for api in "${required_apis[@]}"; do
        if echo "$enabled_apis" | grep -q "^${api}$"; then
            check_ok "  $api"
        else
            check_fail "  $api — will be enabled during --infra"
        fi
    done
    echo ""

    # ── Artifact Registry ────────────────────────────────────
    echo "  Artifact Registry"
    if gcloud artifacts repositories describe "${AR_REPOSITORY}" --location="${GCP_REGION}" --project="$GCP_PROJECT_ID" 2>/dev/null | grep -q .; then
        check_ok "  Repository ${AR_REPOSITORY} exists"
    else
        check_fail "  Repository ${AR_REPOSITORY} does NOT exist — will be created during --build"
    fi
    echo ""

    # ── Terraform ────────────────────────────────────────────
    echo "  Terraform"
    if command -v terraform &>/dev/null; then
        ensure_tf_bucket
        local tf_dir="$SCRIPT_DIR/infra"
        local tf_init_output
        tf_init_output=$(cd "$tf_dir" && terraform init -backend-config="bucket=rcq-terraform-state-${ENV}" -input=false -reconfigure -no-color 2>&1) && \
            check_ok "  terraform init — success" || \
            check_fail "  terraform init — failed: $(echo "$tf_init_output" | tail -1)"

        local tf_validate_output
        tf_validate_output=$(cd "$tf_dir" && terraform validate -no-color 2>&1) && \
            check_ok "  terraform validate — success" || \
            check_fail "  terraform validate — failed: $(echo "$tf_validate_output" | tail -1)"
    else
        check_fail "  terraform — not installed"
    fi
    echo ""

    # ── Cloud SQL Proxy ──────────────────────────────────────
    echo "  Cloud SQL Proxy"
    local proxy_port="${CLOUD_SQL_PROXY_PORT:-3305}"
    if nc -z 127.0.0.1 "$proxy_port" 2>/dev/null; then
        check_ok "  Connected on port ${proxy_port}"
    else
        check_fail "  NOT connected on port ${proxy_port}"
    fi
    echo ""

    # ── MySQL ────────────────────────────────────────────────
    echo "  MySQL"
    require_var MIGRATION_DB_PASSWORD "check"
    require_var MIGRATION_DB_NAME "check"

    local db_host="${MIGRATION_DB_HOST:-127.0.0.1}"
    local db_port="${MIGRATION_DB_PORT:-3306}"
    local db_user="${MIGRATION_DB_USER:-root}"

    MYSQL_CMD=""
    find_mysql_cmds 2>/dev/null || true
    if [ -z "$MYSQL_CMD" ]; then
        check_fail "  mysql client not found — install with: brew install mysql-client"
    else
        local check_err
        check_err=$(mktemp)

        # Check user rcq_readonly
        local user_exists
        user_exists=$($MYSQL_CMD -h "$db_host" -P "$db_port" -u "$db_user" -p"${MIGRATION_DB_PASSWORD}" \
            --skip-column-names -e "SELECT User FROM mysql.user WHERE User='rcq_readonly'" 2>"$check_err" || true)
        if [ -n "$user_exists" ]; then
            check_ok "  User rcq_readonly exists"
        elif [ -s "$check_err" ]; then
            check_fail "  User rcq_readonly — query failed: $(cat "$check_err")"
        else
            check_fail "  User rcq_readonly does NOT exist — will be created during --infra"
        fi

        # Check table schema_migrations
        local table_exists
        > "$check_err"
        table_exists=$($MYSQL_CMD -h "$db_host" -P "$db_port" -u "$db_user" -p"${MIGRATION_DB_PASSWORD}" \
            --skip-column-names -e "SELECT 1 FROM information_schema.tables WHERE table_schema='${MIGRATION_DB_NAME}' AND table_name='schema_migrations'" 2>"$check_err" || true)
        if [ -n "$table_exists" ]; then
            check_ok "  Table schema_migrations exists"
        elif [ -s "$check_err" ]; then
            check_fail "  Table schema_migrations — query failed: $(cat "$check_err")"
        else
            check_fail "  Table schema_migrations does NOT exist — will be created during --migrate"
        fi

        # Check view v_tronc_queteur_enriched
        local view_exists
        > "$check_err"
        view_exists=$($MYSQL_CMD -h "$db_host" -P "$db_port" -u "$db_user" -p"${MIGRATION_DB_PASSWORD}" \
            --skip-column-names -e "SELECT 1 FROM information_schema.views WHERE table_schema='${MIGRATION_DB_NAME}' AND table_name='v_tronc_queteur_enriched'" 2>"$check_err" || true)
        if [ -n "$view_exists" ]; then
            check_ok "  View v_tronc_queteur_enriched exists"
        elif [ -s "$check_err" ]; then
            check_fail "  View v_tronc_queteur_enriched — query failed: $(cat "$check_err")"
        else
            check_fail "  View v_tronc_queteur_enriched does NOT exist — will be created during --migrate"
        fi
        rm -f "$check_err"
    fi
    echo ""

    # ── Secret Manager ───────────────────────────────────────
    echo "  Secret Manager"
    local secret_name="rcq_db_readonly_password"
    if gcloud secrets describe "$secret_name" --project="$GCP_PROJECT_ID" &>/dev/null; then
        check_ok "  Secret ${secret_name} exists"
    else
        check_fail "  Secret ${secret_name} does NOT exist — will be created during --infra"
    fi
    echo ""

    # ── Memorystore (Valkey) ─────────────────────────────────
    echo "  Memorystore (Valkey)"
    local valkey_name="rcq-valkey-${ENV}"
    local valkey_output
    check_err=$(mktemp)
    valkey_output=$(gcloud memorystore instances describe "$valkey_name" --location="$GCP_REGION" --project="$GCP_PROJECT_ID" --format="value(engineVersion,authorizationMode)" 2>"$check_err" || true)
    if [ -n "$valkey_output" ]; then
        local valkey_version valkey_auth
        valkey_version=$(echo "$valkey_output" | head -1 | cut -f1)
        valkey_auth=$(echo "$valkey_output" | head -1 | cut -f2)
        check_ok "  Instance ${valkey_name} exists (Valkey ${valkey_version}, ${valkey_auth})"
    elif [ -s "$check_err" ]; then
        check_fail "  Instance ${valkey_name} — query failed: $(head -1 "$check_err")"
    else
        check_fail "  Instance ${valkey_name} does NOT exist — will be created during --infra"
    fi
    rm -f "$check_err"
    echo ""

    # ── Summary ──────────────────────────────────────────────
    echo "═══════════════════════════════════════════════"
    echo "  ${checks_passed}/${checks_total} checks passed"
    echo "═══════════════════════════════════════════════"
    echo ""
}

if $DO_CHECK; then
    ensure_cloud_sql_proxy
    MIGRATION_DB_HOST="127.0.0.1"
    MIGRATION_DB_PORT="${CLOUD_SQL_PROXY_PORT:-3305}"
    check_environment
fi


# ══════════════════════════════════════════════════════════════
# Step 1: Build & Push Docker images
# ══════════════════════════════════════════════════════════════
build_and_push() {
    if $BUILD_DONE; then
        log_info "Build already done — skipping."
        return
    fi

    echo "═══════════════════════════════════════════════"
    log_info "Step: Build & Push Docker images"
    echo "═══════════════════════════════════════════════"
    echo ""

    # Ensure Artifact Registry repository exists (first deploy in a new GCP project)
    ensure_ar_repository

    # Configure Docker for Artifact Registry
    log_info "Configuring Docker for Artifact Registry..."
    gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet

    local services=("frontend" "backend" "superset")
    local dockerfiles=("frontend/Dockerfile" "backend/Dockerfile" "superset/Dockerfile")
    local contexts=("frontend" "backend" "superset")
    local image_names=("rcq-frontend" "rcq-api" "rcq-superset")

    # Map ENV to Angular build configuration name
    local build_configuration="production"
    case "$ENV" in
        dev)  build_configuration="dev-gcp"  ;;
        test) build_configuration="test-gcp" ;;
        prod) build_configuration="production" ;;
    esac

    # Map --services names to internal service array names
    # --services uses: frontend, api, superset
    # Internal arrays use: frontend, backend, superset
    local services_filter="$SERVICES"
    # Normalize "api" → "backend" for internal matching
    services_filter="${services_filter//api/backend}"

    local cache_flag=""
    if $NO_CACHE; then
        cache_flag="--no-cache"
    fi

    for i in "${!services[@]}"; do
        local svc="${services[$i]}"
        local dockerfile="${dockerfiles[$i]}"
        local context="${contexts[$i]}"
        local image="${REGISTRY}/${image_names[$i]}:${IMAGE_TAG}"

        # Skip services not in --services list
        if [[ ",$services_filter," != *",$svc,"* ]]; then
            log_info "Skipping ${svc} (not in --services)"
            continue
        fi

        # Pass BUILD_CONFIGURATION build arg for frontend
        local extra_build_args=""
        if [ "$svc" = "frontend" ]; then
            extra_build_args="--build-arg BUILD_CONFIGURATION=${build_configuration}"
        fi

        log_info "Building ${svc}..."
        # shellcheck disable=SC2086
        docker buildx build --platform linux/amd64 --provenance=false --sbom=false --output type=docker $cache_flag $extra_build_args -t "$image" -f "$SCRIPT_DIR/$dockerfile" "$SCRIPT_DIR/$context"

        log_info "Pushing ${svc}..."
        docker push "$image"

        log_success "${svc} → $image"
        echo ""
    done

    log_success "Images built and pushed with tag: ${IMAGE_TAG} (services: ${SERVICES})"
    BUILD_DONE=true
    echo ""
}

if $DO_BUILD; then
    build_and_push
fi


# ── Helper: Find mysql/mysqldump binaries ─────────────────────
# Sets MYSQL_CMD and MYSQLDUMP_CMD variables for the caller.
# Handles keg-only installs on macOS / Homebrew.
find_mysql_cmds() {
    if command -v mysql >/dev/null 2>&1; then
        MYSQL_CMD="mysql"
    elif [ -x "/opt/homebrew/opt/mysql-client/bin/mysql" ]; then
        MYSQL_CMD="/opt/homebrew/opt/mysql-client/bin/mysql"
    elif [ -x "/usr/local/opt/mysql-client/bin/mysql" ]; then
        MYSQL_CMD="/usr/local/opt/mysql-client/bin/mysql"
    else
        log_error "MySQL client not found. Install with: brew install mysql-client"
        return 1
    fi

    if command -v mysqldump >/dev/null 2>&1; then
        MYSQLDUMP_CMD="mysqldump"
    elif [ -x "/opt/homebrew/opt/mysql-client/bin/mysqldump" ]; then
        MYSQLDUMP_CMD="/opt/homebrew/opt/mysql-client/bin/mysqldump"
    elif [ -x "/usr/local/opt/mysql-client/bin/mysqldump" ]; then
        MYSQLDUMP_CMD="/usr/local/opt/mysql-client/bin/mysqldump"
    else
        log_error "mysqldump not found. Install with: brew install mysql-client"
        return 1
    fi
}

# ── Helper: Create MySQL read-only user ──────────────────────
create_readonly_user() {
    log_info "Checking if MySQL user 'rcq_readonly' exists..."

    # Find mysql client binary (keg-only on macOS / Homebrew)
    local mysql_cmd
    if command -v mysql >/dev/null 2>&1; then
        mysql_cmd="mysql"
    elif [ -x "/opt/homebrew/opt/mysql-client/bin/mysql" ]; then
        mysql_cmd="/opt/homebrew/opt/mysql-client/bin/mysql"
    elif [ -x "/usr/local/opt/mysql-client/bin/mysql" ]; then
        mysql_cmd="/usr/local/opt/mysql-client/bin/mysql"
    else
        log_error "MySQL client not found. Install with: brew install mysql-client"
        return 1
    fi

    require_var MIGRATION_DB_PASSWORD "readonly user creation"
    require_var MIGRATION_DB_NAME "readonly user creation"
    require_var RCQ_DB_PASSWORD "readonly user creation"

    local db_host="${MIGRATION_DB_HOST:-127.0.0.1}"
    local db_port="${MIGRATION_DB_PORT:-3306}"
    local db_user="${MIGRATION_DB_USER:-root}"

    local mysql_cnf
    mysql_cnf=$(mktemp)
    chmod 600 "$mysql_cnf"
    printf "[client]\npassword=%s\n" "$MIGRATION_DB_PASSWORD" > "$mysql_cnf"
    trap "rm -f $mysql_cnf" RETURN

    local user_exists
    user_exists=$($mysql_cmd --defaults-extra-file="$mysql_cnf" --get-server-public-key -h "$db_host" -P "$db_port" -u "$db_user" \
        --skip-column-names -e "SELECT User FROM mysql.user WHERE User='rcq_readonly'" 2>/dev/null || true)

    if [ -n "$user_exists" ]; then
        log_success "MySQL user 'rcq_readonly' already exists — skipping creation."
        return
    fi

    log_info "Creating MySQL user 'rcq_readonly'..."

    # Create the user and grant SELECT privileges (password from .env)
    $mysql_cmd --defaults-extra-file="$mysql_cnf" --get-server-public-key -h "$db_host" -P "$db_port" -u "$db_user" <<SQL_EOF
CREATE USER 'rcq_readonly'@'%' IDENTIFIED BY '${RCQ_DB_PASSWORD}';
GRANT SELECT ON \`${MIGRATION_DB_NAME}\`.* TO 'rcq_readonly'@'%';
FLUSH PRIVILEGES;
SQL_EOF

    log_success "MySQL user 'rcq_readonly' created with SELECT privileges on '${MIGRATION_DB_NAME}' (password from .env)."

    echo ""
}


# ── Helper: Create Superset metadata DB + read-write user ─────
create_superset_db() {
    log_info "Checking if Superset metadata DB and user exist..."

    # Find mysql client binary (keg-only on macOS / Homebrew)
    local mysql_cmd
    if command -v mysql >/dev/null 2>&1; then
        mysql_cmd="mysql"
    elif [ -x "/opt/homebrew/opt/mysql-client/bin/mysql" ]; then
        mysql_cmd="/opt/homebrew/opt/mysql-client/bin/mysql"
    elif [ -x "/usr/local/opt/mysql-client/bin/mysql" ]; then
        mysql_cmd="/usr/local/opt/mysql-client/bin/mysql"
    else
        log_error "MySQL client not found. Install with: brew install mysql-client"
        return 1
    fi

    require_var MIGRATION_DB_PASSWORD "superset DB creation"
    require_var SUPERSET_DB_RW_USER "superset DB creation"
    require_var SUPERSET_DB_RW_PASSWORD "superset DB creation"

    local db_host="${MIGRATION_DB_HOST:-127.0.0.1}"
    local db_port="${MIGRATION_DB_PORT:-3306}"
    local db_user="${MIGRATION_DB_USER:-root}"
    local superset_db="superset_${ENV}_db"

    local mysql_cnf
    mysql_cnf=$(mktemp)
    chmod 600 "$mysql_cnf"
    printf "[client]\npassword=%s\n" "$MIGRATION_DB_PASSWORD" > "$mysql_cnf"
    trap "rm -f $mysql_cnf" RETURN

    # 1. Create database if it doesn't exist
    local db_exists
    db_exists=$($mysql_cmd --defaults-extra-file="$mysql_cnf" --get-server-public-key -h "$db_host" -P "$db_port" -u "$db_user" \
        --skip-column-names -e "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${superset_db}'" 2>/dev/null || true)

    if [ -z "$db_exists" ]; then
        log_info "Creating database '${superset_db}'..."
        $mysql_cmd --defaults-extra-file="$mysql_cnf" --get-server-public-key -h "$db_host" -P "$db_port" -u "$db_user" \
            -e "CREATE DATABASE \`${superset_db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        log_success "Database '${superset_db}' created."
    else
        log_success "Database '${superset_db}' already exists — skipping."
    fi

    # 2. Create user if it doesn't exist + grant ALL PRIVILEGES
    local user_exists
    user_exists=$($mysql_cmd --defaults-extra-file="$mysql_cnf" --get-server-public-key -h "$db_host" -P "$db_port" -u "$db_user" \
        --skip-column-names -e "SELECT User FROM mysql.user WHERE User='${SUPERSET_DB_RW_USER}'" 2>/dev/null || true)

    if [ -n "$user_exists" ]; then
        log_success "MySQL user '${SUPERSET_DB_RW_USER}' already exists — updating privileges."
        $mysql_cmd --defaults-extra-file="$mysql_cnf" --get-server-public-key -h "$db_host" -P "$db_port" -u "$db_user" <<SQL_EOF
GRANT ALL PRIVILEGES ON \`${superset_db}\`.* TO '${SUPERSET_DB_RW_USER}'@'%';
FLUSH PRIVILEGES;
SQL_EOF
    else
        log_info "Creating MySQL user '${SUPERSET_DB_RW_USER}'..."
        $mysql_cmd --defaults-extra-file="$mysql_cnf" --get-server-public-key -h "$db_host" -P "$db_port" -u "$db_user" <<SQL_EOF
CREATE USER '${SUPERSET_DB_RW_USER}'@'%' IDENTIFIED BY '${SUPERSET_DB_RW_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${superset_db}\`.* TO '${SUPERSET_DB_RW_USER}'@'%';
FLUSH PRIVILEGES;
SQL_EOF
        log_success "MySQL user '${SUPERSET_DB_RW_USER}' created with ALL PRIVILEGES on '${superset_db}'."
    fi

    echo ""
}


# ── Helper: Dump production database ──────────────────────────
dump_prod_database() {
    echo "═══════════════════════════════════════════════"
    log_info "Step: Dump production database"
    echo "═══════════════════════════════════════════════"
    echo ""

    find_mysql_cmds

    require_var MIGRATION_DB_PASSWORD "dump-prod"
    require_var MIGRATION_DB_NAME "dump-prod"

    local db_host="${MIGRATION_DB_HOST:-127.0.0.1}"
    local db_port="${MIGRATION_DB_PORT:-3306}"
    local db_user="${MIGRATION_DB_USER:-root}"

    local mysql_cnf
    mysql_cnf=$(mktemp)
    chmod 600 "$mysql_cnf"
    printf "[client]\npassword=%s\n" "$MIGRATION_DB_PASSWORD" > "$mysql_cnf"
    trap "rm -f $mysql_cnf" RETURN

    local dump_dir="$SCRIPT_DIR/superset/dev-sql-import/prod-data"
    mkdir -p "$dump_dir"

    local dump_date
    dump_date=$(date +%Y-%m-%d)
    local dump_file="${dump_dir}/${dump_date}-RCQ-FR-PROD-data.sql"

    if [ -f "$dump_file" ]; then
        log_warn "Dump file already exists: $dump_file"
        if ! $SKIP_CONFIRM; then
            read -r -p "Overwrite? [y/N] " response
            case "$response" in
                [yY][eE][sS]|[yY]) ;;
                *)
                    log_info "Aborted."
                    return
                    ;;
            esac
        fi
    fi

    log_info "Dumping database '${MIGRATION_DB_NAME}' to ${dump_file}..."

    $MYSQLDUMP_CMD --defaults-extra-file="$mysql_cnf" --get-server-public-key \
        -h "$db_host" -P "$db_port" -u "$db_user" \
        --databases "$MIGRATION_DB_NAME" \
        --triggers \
        --routines \
        --single-transaction \
        --set-gtid-purged=OFF \
        --column-statistics=0 \
        > "$dump_file"

    local file_size
    file_size=$(du -h "$dump_file" | cut -f1)
    log_success "Dump complete: ${dump_file} (${file_size})"
    echo ""
}


# ── Helper: Copy production data to dev/test ──────────────────
copy_prod_to_env() {
    echo "═══════════════════════════════════════════════"
    log_info "Step: Copy production data to ${ENV}"
    echo "═══════════════════════════════════════════════"
    echo ""

    local start_time
    start_time=$(date +%s)

    find_mysql_cmds

    require_var MIGRATION_DB_PASSWORD "copy-prod"
    require_var MIGRATION_DB_NAME "copy-prod"

    local db_host="${MIGRATION_DB_HOST:-127.0.0.1}"
    local db_port="${MIGRATION_DB_PORT:-3306}"
    local db_user="${MIGRATION_DB_USER:-root}"

    # Find the latest dump file
    local dump_dir="$SCRIPT_DIR/superset/dev-sql-import/prod-data"
    if [ ! -d "$dump_dir" ]; then
        log_error "Dump directory not found: $dump_dir"
        log_info "Run './gcp-deploy.sh prod --dump-prod' first to create a dump."
        exit 1
    fi

    local dump_file
    dump_file=$(ls -t "$dump_dir"/*-RCQ-FR-PROD-data.sql 2>/dev/null | head -1)
    if [ -z "$dump_file" ]; then
        log_error "No production dump file found in $dump_dir"
        log_info "Run './gcp-deploy.sh prod --dump-prod' first to create a dump."
        exit 1
    fi

    local file_size
    file_size=$(du -h "$dump_file" | cut -f1)
    log_info "Using dump: $(basename "$dump_file") (${file_size})"
    log_info "Target database: ${MIGRATION_DB_NAME}"

    if ! $SKIP_CONFIRM; then
        echo ""
        echo -e "${RED}⚠️  WARNING: This will DROP and recreate database '${MIGRATION_DB_NAME}'!${NC}"
        read -r -p "Continue? [y/N] " response
        case "$response" in
            [yY][eE][sS]|[yY]) ;;
            *)
                log_info "Aborted."
                return
                ;;
        esac
    fi

    local mysql_cnf
    mysql_cnf=$(mktemp)
    chmod 600 "$mysql_cnf"
    printf "[client]\npassword=%s\n" "$MIGRATION_DB_PASSWORD" > "$mysql_cnf"
    trap "rm -f $mysql_cnf" RETURN

    # Step 1: Drop and recreate database
    log_info "Dropping database '${MIGRATION_DB_NAME}'..."
    $MYSQL_CMD --defaults-extra-file="$mysql_cnf" --get-server-public-key \
        -h "$db_host" -P "$db_port" -u "$db_user" \
        -e "DROP DATABASE IF EXISTS \`${MIGRATION_DB_NAME}\`;"

    log_info "Creating database '${MIGRATION_DB_NAME}'..."
    $MYSQL_CMD --defaults-extra-file="$mysql_cnf" --get-server-public-key \
        -h "$db_host" -P "$db_port" -u "$db_user" \
        -e "CREATE DATABASE \`${MIGRATION_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

    # Step 2: Import dump with schema name replacement
    log_info "Importing dump (renaming schema to '${MIGRATION_DB_NAME}')..."
    sed -E "s/rcq_fr_(prod|dev|test)_db/${MIGRATION_DB_NAME}/g" "$dump_file" \
        | $MYSQL_CMD --defaults-extra-file="$mysql_cnf" --get-server-public-key \
            -h "$db_host" -P "$db_port" -u "$db_user"

    log_success "Import complete."

    # Step 3: Run anonymisation script
    local anonymise_script="$SCRIPT_DIR/superset/dev-sql-import/03-anonymise.sql"
    if [ -f "$anonymise_script" ]; then
        log_info "Running anonymisation script..."
        $MYSQL_CMD --defaults-extra-file="$mysql_cnf" --get-server-public-key \
            -h "$db_host" -P "$db_port" -u "$db_user" \
            "$MIGRATION_DB_NAME" < "$anonymise_script"
        log_success "Anonymisation complete."
    else
        log_warn "Anonymisation script not found: $anonymise_script — skipping."
    fi

    # Step 4: Run migrations
    local migration_script="$SCRIPT_DIR/scripts/run-migrations.sh"
    if [ -x "$migration_script" ]; then
        log_info "Running migrations..."
        export DB_HOST="$db_host"
        export DB_PORT="$db_port"
        export MIGRATION_DB_NAME="${MIGRATION_DB_NAME}"
        "$migration_script" "$ENV" "$db_user" "$MIGRATION_DB_PASSWORD"
        log_success "Migrations complete."
    else
        log_warn "Migration script not found or not executable: $migration_script — skipping."
    fi

    local end_time
    end_time=$(date +%s)
    local duration=$(( end_time - start_time ))

    echo ""
    echo "═══════════════════════════════════════════════"
    log_success "Copy-prod summary"
    echo "  Dump file:    $(basename "$dump_file")"
    echo "  Target DB:    ${MIGRATION_DB_NAME}"
    echo "  Environment:  ${ENV}"
    echo "  Duration:     ${duration}s"
    echo "═══════════════════════════════════════════════"
    echo ""
}


# ── Seed Secret Manager values from .env ─────────────────────
seed_secrets() {
    log_info "Seeding Secret Manager values from .env..."

    local secrets_to_seed=(
        "rcq_db_readonly_username:RCQ_DB_USER"
        "rcq_db_readonly_password:RCQ_DB_PASSWORD"
        "rcq_google_oauth_client_id:GOOGLE_OAUTH_CLIENT_ID"
        "rcq_google_oauth_client_secret:GOOGLE_OAUTH_CLIENT_SECRET"
        "rcq_superset_admin_password:SUPERSET_ADMIN_PASSWORD"
        "rcq_jwt_secret_key:JWT_SECRET_KEY"
    )

    if $ENABLE_SUPERSET; then
        secrets_to_seed+=(
            "rcq_superset_secret_key:SUPERSET_SECRET_KEY"
            "rcq_superset_db_rw_username:SUPERSET_DB_RW_USER"
            "rcq_superset_db_rw_password:SUPERSET_DB_RW_PASSWORD"
        )
    fi

    for entry in "${secrets_to_seed[@]}"; do
        local secret_name="${entry%%:*}"
        local env_var="${entry##*:}"
        local value="${!env_var:-}"

        if [ -z "$value" ]; then
            log_warn "Skipping $secret_name — $env_var is empty in .env"
            continue
        fi

        # Check if secret already has a version with this value
        local existing_value
        existing_value=$(gcloud secrets versions access latest --secret="$secret_name" --project="$GCP_PROJECT_ID" 2>/dev/null || echo "")

        if [ "$existing_value" = "$value" ]; then
            log_info "$secret_name — already up to date"
        else
            echo -n "$value" | gcloud secrets versions add "$secret_name" --project="$GCP_PROJECT_ID" --data-file=-
            log_success "$secret_name — updated"
        fi
    done
}

# ══════════════════════════════════════════════════════════════
# Step 2: Terraform (infrastructure)
# ══════════════════════════════════════════════════════════════
run_infra() {
    echo "═══════════════════════════════════════════════"
    log_info "Step: Terraform infrastructure"
    echo "═══════════════════════════════════════════════"
    echo ""

    cd "$SCRIPT_DIR/infra"

    # Ensure GCS bucket for Terraform state exists
    ensure_tf_bucket

    # Initialize Terraform
    log_info "Initializing Terraform..."
    terraform init -backend-config="bucket=rcq-terraform-state-${ENV}" -input=false -reconfigure

    # Untaint any tainted Cloud Run services (from previous failed deploys)
    for svc in module.api.google_cloud_run_v2_service.service module.superset.google_cloud_run_v2_service.service module.frontend.google_cloud_run_v2_service.service; do
        if terraform state show "$svc" 2>/dev/null | grep -q 'tainted'; then
            log_info "Untainting $svc..."
            terraform untaint "$svc" || true
        fi
    done

    # Build images before terraform apply (Cloud Run needs them)
    if ! $PLAN_ONLY && ! $SKIP_BUILD; then
        build_and_push
    fi

    # When --skip-build, find the latest pushed tag from the registry
    if $SKIP_BUILD && ! $PLAN_ONLY; then
        log_info "Skip-build: looking up latest image tag from registry..."
        # Query the latest tag for any service (e.g. rcq-frontend)
        local latest_tag
        latest_tag=$(gcloud artifacts docker tags list \
            "${REGISTRY}/rcq-frontend" \
            --project="${GCP_PROJECT_ID}" \
            --sort-by=~UPDATE_TIME \
            --limit=5 \
            --format="value(tag)" 2>/dev/null \
            | grep "^${ENV}-" \
            | head -1)
        if [ -n "$latest_tag" ]; then
            IMAGE_TAG="$latest_tag"
            log_info "Using existing image tag: ${IMAGE_TAG}"
        else
            log_error "No image found in registry for env ${ENV}. Run without --skip-build first."
            exit 1
        fi
    fi

    # Pass image tag as extra var when applying (not plan-only)
    # Note: base image names (without tag) are already set in the .tfvars files.
    # Terraform appends :${var.image_tag} in main.tf, so we only pass the tag here.
    local extra_vars=""
    if ! $PLAN_ONLY; then
        extra_vars="-var=image_tag=${IMAGE_TAG}"
    fi

    # Override cloud_sql_connection_name from .env if set
    if [ -n "${CLOUD_SQL_CONNECTION_NAME:-}" ]; then
        extra_vars="$extra_vars -var=cloud_sql_connection_name=${CLOUD_SQL_CONNECTION_NAME}"
    fi

    # Pass enable_superset to Terraform
    if $ENABLE_SUPERSET; then
        extra_vars="$extra_vars -var=enable_superset=true"
    else
        extra_vars="$extra_vars -var=enable_superset=false"
    fi

    # Plan-only mode: just show the plan and exit
    if $PLAN_ONLY; then
        log_info "Running terraform plan..."
        # shellcheck disable=SC2086
        terraform plan -var-file="env/${ENV}.tfvars" $extra_vars -out=tfplan
        rm -f tfplan
        log_success "Plan complete (dry run — no changes applied)."
        cd "$SCRIPT_DIR"
        return
    fi

    # Phase 1: Create secret shells first (so seed_secrets can populate them)
    log_info "Phase 1: Creating secrets..."

    local secret_targets=(
        "-target=google_secret_manager_secret.db_readonly_username"
        "-target=google_secret_manager_secret.db_readonly_password"
        "-target=google_secret_manager_secret.google_oauth_client_id"
        "-target=google_secret_manager_secret.google_oauth_client_secret"
        "-target=google_secret_manager_secret.superset_admin_password"
        "-target=google_secret_manager_secret.jwt_secret_key"
    )

    if $ENABLE_SUPERSET; then
        secret_targets+=(
            "-target=google_secret_manager_secret.superset_secret_key"
            "-target=google_secret_manager_secret.superset_db_rw_username"
            "-target=google_secret_manager_secret.superset_db_rw_password"
        )
    fi

    # shellcheck disable=SC2086
    terraform apply -auto-approve -var-file="env/${ENV}.tfvars" $extra_vars \
        "${secret_targets[@]}" \
        || true

    # Phase 2: Seed secret values from .env (before Cloud Run needs them)
    cd "$SCRIPT_DIR"
    seed_secrets
    cd "$SCRIPT_DIR/infra"

    # Phase 2b: Create MySQL users (before Cloud Run needs them)
    cd "$SCRIPT_DIR"
    create_readonly_user
    if $ENABLE_SUPERSET; then
        create_superset_db
    else
        log_info "Skipping Superset DB creation (--superset not specified)"
    fi
    cd "$SCRIPT_DIR/infra"

    # Phase 3: Full terraform apply (Cloud Run can now access secret values)
    log_info "Phase 3: Deploying all infrastructure..."
    # shellcheck disable=SC2086
    terraform plan -var-file="env/${ENV}.tfvars" $extra_vars -out=tfplan
    terraform apply tfplan

    # Clean up plan file
    rm -f tfplan

    log_success "Infrastructure applied successfully."
    cd "$SCRIPT_DIR"
    echo ""

}

if $DO_INFRA; then
    if ! $PLAN_ONLY; then
        ensure_cloud_sql_proxy
        MIGRATION_DB_HOST="127.0.0.1"
        MIGRATION_DB_PORT="${CLOUD_SQL_PROXY_PORT:-3305}"
    fi
    run_infra
fi

# ══════════════════════════════════════════════════════════════
# Step 2b: Destroy Superset resources
# ══════════════════════════════════════════════════════════════
if $DESTROY_SUPERSET; then
    echo "═══════════════════════════════════════════════"
    log_warn "⚠️  This will destroy Superset Cloud Run service and related secrets. Valkey will NOT be affected."
    echo "═══════════════════════════════════════════════"
    echo ""

    if ! $SKIP_CONFIRM; then
        read -r -p "Are you sure you want to destroy Superset resources? [y/N] " response
        case "$response" in
            [yY][eE][sS]|[yY]) ;;
            *)
                echo "Aborted."
                exit 0
                ;;
        esac
        echo ""
    fi

    cd "$SCRIPT_DIR/infra"

    ensure_tf_bucket

    log_info "Initializing Terraform..."
    terraform init -backend-config="bucket=rcq-terraform-state-${ENV}" -input=false -reconfigure

    # Find the latest image tag for terraform (needed for other resources)
    latest_tag=$(gcloud artifacts docker tags list \
        "${REGISTRY}/rcq-frontend" \
        --project="${GCP_PROJECT_ID}" \
        --sort-by=~UPDATE_TIME \
        --limit=5 \
        --format="value(tag)" 2>/dev/null \
        | grep "^${ENV}-" \
        | head -1 || echo "")

    destroy_extra_vars=""
    if [ -n "$latest_tag" ]; then
        destroy_extra_vars="$destroy_extra_vars -var=image_tag=${latest_tag}"
    fi
    if [ -n "${CLOUD_SQL_CONNECTION_NAME:-}" ]; then
        destroy_extra_vars="$destroy_extra_vars -var=cloud_sql_connection_name=${CLOUD_SQL_CONNECTION_NAME}"
    fi

    # Pre-cleanup: Remove IAM binding via gcloud to avoid ETag conflict loop in terraform
    # The google_cloud_run_service_iam_member resource has a known issue where concurrent
    # policy changes cause infinite SetIamPolicy retries.
    log_info "Pre-cleanup: Removing Superset IAM bindings via gcloud..."

    # Get the API service account email
    local api_sa
    api_sa=$(gcloud run services describe rcq-api --project="${GCP_PROJECT_ID}" --region="${GCP_REGION}" --format="value(spec.template.spec.serviceAccountName)" 2>/dev/null || echo "")

    if [ -n "$api_sa" ]; then
        # Remove the IAM binding directly via gcloud (idempotent, won't error if not found)
        gcloud run services remove-iam-policy-binding rcq-superset \
            --project="${GCP_PROJECT_ID}" \
            --region="${GCP_REGION}" \
            --member="serviceAccount:${api_sa}" \
            --role="roles/run.invoker" 2>/dev/null || true
        log_info "IAM binding removed via gcloud"
    fi

    # Remove from terraform state to prevent terraform from trying to destroy it
    terraform state rm 'module.iam.google_cloud_run_service_iam_member.api_to_superset[0]' 2>/dev/null || true
    log_info "IAM binding removed from terraform state"
    echo ""

    log_info "Step 1/2: Disabling deletion protection on Superset..."
    # shellcheck disable=SC2086
    terraform apply -auto-approve -var-file="env/${ENV}.tfvars" -var=enable_superset=true -var=allow_resource_destruction=true $destroy_extra_vars

    log_info "Step 2/2: Destroying Superset resources..."
    # shellcheck disable=SC2086
    terraform apply -auto-approve -var-file="env/${ENV}.tfvars" -var=enable_superset=false -var=allow_resource_destruction=true $destroy_extra_vars

    log_success "Superset resources destroyed."
    cd "$SCRIPT_DIR"
    echo ""
fi

# ══════════════════════════════════════════════════════════════
# Step 3: Database migrations
# ══════════════════════════════════════════════════════════════
run_migrations() {
    echo "═══════════════════════════════════════════════"
    log_info "Step: Database migrations"
    echo "═══════════════════════════════════════════════"
    echo ""

    require_var MIGRATION_DB_PASSWORD "migrations"
    require_var MIGRATION_DB_NAME "migrations"

    local migration_script="$SCRIPT_DIR/scripts/run-migrations.sh"
    if [ ! -x "$migration_script" ]; then
        log_error "Migration script not found or not executable: $migration_script"
        log_info "Run: chmod +x scripts/run-migrations.sh"
        exit 1
    fi

    log_info "Running migrations for environment: $ENV"
    echo ""

    # Export DB vars so run-migrations.sh can pick them up
    export DB_HOST="${MIGRATION_DB_HOST:-127.0.0.1}"
    export DB_PORT="${MIGRATION_DB_PORT:-3306}"
    export MIGRATION_DB_NAME="${MIGRATION_DB_NAME}"

    "$migration_script" "$ENV" "${MIGRATION_DB_USER:-root}" "${MIGRATION_DB_PASSWORD}"

    log_success "Migrations complete."
    echo ""
}

if $DO_MIGRATE; then
    ensure_cloud_sql_proxy
    MIGRATION_DB_HOST="127.0.0.1"
    MIGRATION_DB_PORT="${CLOUD_SQL_PROXY_PORT:-3305}"
    run_migrations
fi

# ══════════════════════════════════════════════════════════════
# Step 4: Provision Superset dashboards
# ══════════════════════════════════════════════════════════════
run_provision() {
    echo "═══════════════════════════════════════════════"
    log_info "Step: Provision Superset dashboards"
    echo "═══════════════════════════════════════════════"
    echo ""

    require_var SUPERSET_URL "provisioning"
    require_var SUPERSET_ADMIN_PASSWORD "provisioning"

    # If custom domain doesn't resolve, try to get Cloud Run URL from Terraform
    local effective_superset_url="$SUPERSET_URL"
    if ! curl -s --connect-timeout 5 -o /dev/null "$SUPERSET_URL" 2>/dev/null; then
        log_warn "Cannot reach $SUPERSET_URL — trying Cloud Run URL from Terraform..."
        cd "$SCRIPT_DIR/infra"
        local tf_url
        tf_url=$(terraform output -raw superset_url 2>/dev/null || echo "")
        cd "$SCRIPT_DIR"
        if [ -n "$tf_url" ] && [ "$tf_url" != "N/A" ]; then
            effective_superset_url="$tf_url"
            log_info "Using Cloud Run URL: $effective_superset_url"
        else
            log_error "Cannot resolve SUPERSET_URL and no Cloud Run URL found in Terraform outputs."
            return 1
        fi
    fi

    # If custom frontend domain doesn't resolve, try to get Cloud Run URL from Terraform
    local effective_embedding_domains="${EMBEDDING_ALLOWED_DOMAINS:-}"
    if [ -n "$effective_embedding_domains" ] && ! curl -s --connect-timeout 5 -o /dev/null "$effective_embedding_domains" 2>/dev/null; then
        log_warn "Cannot reach $effective_embedding_domains — trying Cloud Run URL from Terraform..."
        cd "$SCRIPT_DIR/infra"
        local tf_frontend_url
        tf_frontend_url=$(terraform output -raw frontend_url 2>/dev/null || echo "")
        cd "$SCRIPT_DIR"
        if [ -n "$tf_frontend_url" ] && [ "$tf_frontend_url" != "N/A" ]; then
            effective_embedding_domains="$tf_frontend_url"
            log_info "Using Cloud Run frontend URL for embedding: $effective_embedding_domains"
        else
            log_warn "Cannot resolve EMBEDDING_ALLOWED_DOMAINS and no frontend Cloud Run URL found."
        fi
    fi

    log_info "Provisioning Superset dashboards for environment: $ENV"

    # Generate component .env files (backend/.env, superset/.env, superset/provisioning/.env.{env})
    "$SCRIPT_DIR/scripts/generate-env.sh" "$ENV"

    # Export GCP-specific vars that generate-env.sh doesn't write but provisioning needs
    export SUPERSET_URL="$effective_superset_url"
    export EMBEDDING_ALLOWED_DOMAINS="$effective_embedding_domains"
    export DB_CONNECTION_NAME="${DB_CONNECTION_NAME:-RCQ MySQL}"
    export DB_SQLALCHEMY_URI="mysql+mysqldb://${RCQ_DB_USER}:${RCQ_DB_PASSWORD}@/${RCQ_DB_NAME}?unix_socket=/cloudsql/${CLOUD_SQL_CONNECTION_NAME}"
    export BACKEND_ENV_PATH="$SCRIPT_DIR/backend/.env"

    cd "$SCRIPT_DIR/superset/provisioning"
    python3 scripts/provision_superset.py --env "$ENV" --force-update --auto-restart --no-restart
    cd "$SCRIPT_DIR"

    # Clean up generated provisioning env file
    rm -f "$SCRIPT_DIR/superset/provisioning/.env.${ENV}"

    log_success "Superset dashboards provisioned."
    echo ""
}

if $DO_PROVISION; then
    if $ENABLE_SUPERSET; then
        run_provision
    else
        log_info "Skipping Superset provisioning (--superset not specified)"
    fi
fi

# ══════════════════════════════════════════════════════════════
# Step 5: Dump / Copy production database
# ══════════════════════════════════════════════════════════════
if $DO_DUMP_PROD; then
    ensure_cloud_sql_proxy
    MIGRATION_DB_HOST="127.0.0.1"
    MIGRATION_DB_PORT="${CLOUD_SQL_PROXY_PORT:-3305}"
    dump_prod_database
fi

if $DO_COPY_PROD; then
    ensure_cloud_sql_proxy
    MIGRATION_DB_HOST="127.0.0.1"
    MIGRATION_DB_PORT="${CLOUD_SQL_PROXY_PORT:-3305}"
    copy_prod_to_env
fi

# ══════════════════════════════════════════════════════════════
# Summary & Output
# ══════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════"
echo "  🎉 Deployment Summary"
echo "═══════════════════════════════════════════════"
echo ""
echo "  Environment:  $ENV"
echo "  Project:      $GCP_PROJECT_ID"
echo "  Image tag:    $IMAGE_TAG"
echo "  Services:     $SERVICES"
echo ""

# Show Terraform outputs if infra or provision was run
if { $DO_INFRA && ! $PLAN_ONLY; } || $DO_PROVISION; then
    cd "$SCRIPT_DIR/infra"
    TF_FRONTEND_URL="$(tofu output -raw frontend_url 2>/dev/null || echo 'N/A')"
    TF_API_URL="$(tofu output -raw api_url 2>/dev/null || echo 'N/A')"
    TF_SUPERSET_URL="$(tofu output -raw superset_url 2>/dev/null || echo 'N/A')"
    TF_VALKEY_ENDPOINTS="$(tofu output -json valkey_endpoints 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); c=d[0]['connections'][0]['psc_auto_connection'][0]; print(f\"{c['ip_address']}:{c['port']}\")" 2>/dev/null || echo 'N/A')"
    cd "$SCRIPT_DIR"

    echo "  📍 Service URLs:"
    echo "    Frontend:  $TF_FRONTEND_URL"
    echo "    API:       $TF_API_URL"
    echo "    Superset:  $TF_SUPERSET_URL"
    echo "    Valkey:    $TF_VALKEY_ENDPOINTS"
    echo ""

    FRONTEND_DOMAIN="$(grep -E '^frontend_domain' "$TFVARS_FILE" | sed 's/.*=[[:space:]]*"\(.*\)"/\1/')"
    API_DOMAIN="$(grep -E '^api_domain' "$TFVARS_FILE" | sed 's/.*=[[:space:]]*"\(.*\)"/\1/')"
    SUPERSET_DOMAIN="$(grep -E '^superset_domain' "$TFVARS_FILE" | sed 's/.*=[[:space:]]*"\(.*\)"/\1/')"

    echo "  🌐 Custom Domains:"
    echo "    Frontend:  https://${FRONTEND_DOMAIN:-N/A}"
    echo "    API:       https://${API_DOMAIN:-N/A}"
    echo "    Superset:  https://${SUPERSET_DOMAIN:-N/A}"
    echo ""

    if $DO_INFRA && ! $PLAN_ONLY; then
        echo "  🔗 DNS — Add these CNAME records to your redcrossquest.com zone:"
        echo "    (required BEFORE deploying infrastructure)"
        echo ""
        FRONTEND_SUB="${FRONTEND_DOMAIN%.redcrossquest.com}"
        API_SUB="${API_DOMAIN%.redcrossquest.com}"
        SUPERSET_SUB="${SUPERSET_DOMAIN%.redcrossquest.com}"
        printf "    %-25s  3600  IN  CNAME  ghs.googlehosted.com.\n" "${FRONTEND_SUB:-N/A}"
        printf "    %-25s  3600  IN  CNAME  ghs.googlehosted.com.\n" "${API_SUB:-N/A}"
        printf "    %-25s  3600  IN  CNAME  ghs.googlehosted.com.\n" "${SUPERSET_SUB:-N/A}"
        echo ""
    fi
fi

echo "  🔧 Superset admin access:"
echo "    gcloud run services proxy rcq-superset --region ${GCP_REGION} --project ${GCP_PROJECT_ID} --port 8088"
echo ""

$DO_CHECK    && log_success "Environment check: done"
$BUILD_DONE  && log_success "Build & push: done"
$DO_INFRA    && { $PLAN_ONLY && log_success "Terraform plan: done" || log_success "Terraform apply: done"; }
$DO_MIGRATE  && log_success "Migrations: done"
$DO_PROVISION && log_success "Provisioning: done"
$DESTROY_SUPERSET && log_success "Destroy Superset: done"
$DO_DUMP_PROD && log_success "Dump production DB: done"
$DO_COPY_PROD && log_success "Copy production data: done"

# ── Restore local environment ────────────────────────────────
if [ -f "$SCRIPT_DIR/.env" ]; then
    echo ""
    log_info "🔄 Restoring local environment..."
    "$SCRIPT_DIR/scripts/generate-env.sh" local
fi

echo ""
log_success "Deployment complete for ${ENV}!"
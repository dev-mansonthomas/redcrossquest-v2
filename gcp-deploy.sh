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
#   --build          Build and push Docker images
#   --infra          Apply Terraform (infrastructure)
#   --migrate        Run SQL migrations
#   --provision      Provision Superset dashboards
#   --check          Check environment readiness (DB user, secrets, etc.)
#   --all            Do everything (build + infra + migrate + provision)
#   --plan           Terraform plan only (dry run)
#   --skip-confirm   Skip confirmation prompts
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

Options:
  --build          Build and push Docker images to Artifact Registry
  --infra          Apply Terraform infrastructure changes
  --migrate        Run SQL migrations via scripts/run-migrations.sh
  --provision      Provision Superset dashboards
  --check          Check environment readiness (DB user, secrets, etc.)
  --all            Run all steps: build + infra + migrate + provision
  --plan           Terraform plan only (dry run, no apply)
  --skip-confirm   Skip confirmation prompts
  --help           Show this help message

Examples:
  ./gcp-deploy.sh dev --plan                  # Dry run: show Terraform plan
  ./gcp-deploy.sh dev --build                 # Build and push Docker images
  ./gcp-deploy.sh dev --infra                 # Apply infrastructure changes
  ./gcp-deploy.sh dev --migrate               # Run database migrations
  ./gcp-deploy.sh dev --all                   # Full deployment
  ./gcp-deploy.sh prod --all --skip-confirm   # Full prod deploy, no prompts
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

while [[ $# -gt 0 ]]; do
    case $1 in
        --build)       DO_BUILD=true;     shift ;;
        --infra)       DO_INFRA=true;     shift ;;
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
        --plan)        PLAN_ONLY=true; DO_INFRA=true; shift ;;
        --skip-confirm) SKIP_CONFIRM=true; shift ;;
        --help|-h)     show_help ;;
        *)
            log_error "Unknown option: $1"
            echo "Run './gcp-deploy.sh --help' for usage."
            exit 1
            ;;
    esac
done

if ! $DO_BUILD && ! $DO_INFRA && ! $DO_MIGRATE && ! $DO_PROVISION && ! $DO_CHECK; then
    log_error "No action specified. Use --build, --infra, --migrate, --provision, --check, --all, or --plan."
    echo "Run './gcp-deploy.sh --help' for usage."
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
echo ""
echo "  Steps:"
$DO_CHECK    && echo "    ✦ Check environment readiness"
$DO_BUILD    && echo "    ✦ Build & push Docker images"
$DO_INFRA    && { $PLAN_ONLY && echo "    ✦ Terraform plan (dry run)" || echo "    ✦ Terraform apply"; }
$DO_MIGRATE  && echo "    ✦ Run SQL migrations"
$DO_PROVISION && echo "    ✦ Provision Superset dashboards"
echo ""

if ! $SKIP_CONFIRM; then
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


# ══════════════════════════════════════════════════════════════
# Step 0: Check environment readiness
# ══════════════════════════════════════════════════════════════
check_environment() {
    echo "═══════════════════════════════════════════════"
    log_info "Step: Check environment readiness"
    echo "═══════════════════════════════════════════════"
    echo ""

    require_var MIGRATION_DB_PASSWORD "check"
    require_var MIGRATION_DB_NAME "check"

    local db_host="${MIGRATION_DB_HOST:-127.0.0.1}"
    local db_port="${MIGRATION_DB_PORT:-3306}"
    local db_user="${MIGRATION_DB_USER:-root}"

    # ── Check MySQL user rcq_readonly ────────────────────────
    log_info "Checking MySQL user 'rcq_readonly'..."
    local user_exists
    user_exists=$(mysql -h "$db_host" -P "$db_port" -u "$db_user" -p"${MIGRATION_DB_PASSWORD}" \
        --skip-column-names -e "SELECT User FROM mysql.user WHERE User='rcq_readonly'" 2>/dev/null || true)

    if [ -n "$user_exists" ]; then
        log_success "MySQL user 'rcq_readonly' exists"
    else
        log_error "MySQL user 'rcq_readonly' does NOT exist"
    fi

    # ── Check Secret Manager secret ─────────────────────────
    local secret_name="rcq_db_readonly_password_${ENV}"
    log_info "Checking Secret Manager secret '${secret_name}'..."

    if gcloud secrets describe "$secret_name" --project="$GCP_PROJECT_ID" &>/dev/null; then
        log_success "Secret '${secret_name}' exists in Secret Manager"
    else
        log_error "Secret '${secret_name}' does NOT exist in Secret Manager"
    fi

    echo ""
}

if $DO_CHECK; then
    check_environment
fi


# ══════════════════════════════════════════════════════════════
# Step 1: Build & Push Docker images
# ══════════════════════════════════════════════════════════════
build_and_push() {
    echo "═══════════════════════════════════════════════"
    log_info "Step: Build & Push Docker images"
    echo "═══════════════════════════════════════════════"
    echo ""

    # Configure Docker for Artifact Registry
    log_info "Configuring Docker for Artifact Registry..."
    gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet

    local services=("frontend" "backend" "superset")
    local dockerfiles=("frontend/Dockerfile" "backend/Dockerfile" "superset/Dockerfile")
    local contexts=("frontend" "backend" "superset")
    local image_names=("rcq-frontend" "rcq-api" "rcq-superset")

    for i in "${!services[@]}"; do
        local svc="${services[$i]}"
        local dockerfile="${dockerfiles[$i]}"
        local context="${contexts[$i]}"
        local image="${REGISTRY}/${image_names[$i]}:${IMAGE_TAG}"

        log_info "Building ${svc}..."
        docker build -t "$image" -f "$SCRIPT_DIR/$dockerfile" "$SCRIPT_DIR/$context"

        log_info "Pushing ${svc}..."
        docker push "$image"

        log_success "${svc} → $image"
        echo ""
    done

    log_success "All images built and pushed with tag: ${IMAGE_TAG}"
    echo ""
}

if $DO_BUILD; then
    build_and_push
fi


# ── Helper: Create MySQL read-only user ──────────────────────
create_readonly_user() {
    log_info "Checking if MySQL user 'rcq_readonly' exists..."

    require_var MIGRATION_DB_PASSWORD "readonly user creation"
    require_var MIGRATION_DB_NAME "readonly user creation"

    local db_host="${MIGRATION_DB_HOST:-127.0.0.1}"
    local db_port="${MIGRATION_DB_PORT:-3306}"
    local db_user="${MIGRATION_DB_USER:-root}"

    local user_exists
    user_exists=$(mysql -h "$db_host" -P "$db_port" -u "$db_user" -p"${MIGRATION_DB_PASSWORD}" \
        --skip-column-names -e "SELECT User FROM mysql.user WHERE User='rcq_readonly'" 2>/dev/null || true)

    if [ -n "$user_exists" ]; then
        log_success "MySQL user 'rcq_readonly' already exists — skipping creation."
        return
    fi

    log_info "Creating MySQL user 'rcq_readonly'..."

    # Generate a random 32-character password
    local readonly_password
    readonly_password="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)"

    # Create the user and grant SELECT privileges
    mysql -h "$db_host" -P "$db_port" -u "$db_user" -p"${MIGRATION_DB_PASSWORD}" <<SQL_EOF
CREATE USER 'rcq_readonly'@'%' IDENTIFIED BY '${readonly_password}';
GRANT SELECT ON \`${MIGRATION_DB_NAME}\`.* TO 'rcq_readonly'@'%';
FLUSH PRIVILEGES;
SQL_EOF

    log_success "MySQL user 'rcq_readonly' created with SELECT privileges on '${MIGRATION_DB_NAME}'."

    # Store the password in GCP Secret Manager
    local secret_name="rcq_db_readonly_password_${ENV}"
    log_info "Storing password in Secret Manager as '${secret_name}'..."

    if gcloud secrets describe "$secret_name" --project="$GCP_PROJECT_ID" &>/dev/null; then
        # Secret exists — add a new version
        echo -n "$readonly_password" | gcloud secrets versions add "$secret_name" \
            --project="$GCP_PROJECT_ID" --data-file=-
        log_success "New version added to existing secret '${secret_name}'."
    else
        # Secret does not exist — create it
        echo -n "$readonly_password" | gcloud secrets create "$secret_name" \
            --project="$GCP_PROJECT_ID" --data-file=- --replication-policy=automatic
        log_success "Secret '${secret_name}' created in Secret Manager."
    fi

    echo ""
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

    # Initialize Terraform
    log_info "Initializing Terraform..."
    terraform init -backend-config="bucket=rcq-terraform-state-${ENV}" -input=false

    # Pass image tags as extra vars if we just built
    local extra_vars=""
    if $DO_BUILD; then
        extra_vars="-var=superset_image=${REGISTRY}/rcq-superset:${IMAGE_TAG}"
        extra_vars="$extra_vars -var=api_image=${REGISTRY}/rcq-api:${IMAGE_TAG}"
        extra_vars="$extra_vars -var=frontend_image=${REGISTRY}/rcq-frontend:${IMAGE_TAG}"
    fi

    # Plan
    log_info "Running terraform plan..."
    # shellcheck disable=SC2086
    terraform plan -var-file="env/${ENV}.tfvars" $extra_vars -out=tfplan

    if $PLAN_ONLY; then
        log_success "Plan complete (dry run — no changes applied)."
        cd "$SCRIPT_DIR"
        return
    fi

    # Apply
    log_info "Applying Terraform changes..."
    terraform apply tfplan

    # Clean up plan file
    rm -f tfplan

    log_success "Infrastructure applied successfully."
    cd "$SCRIPT_DIR"
    echo ""

    # ── Create MySQL read-only user if it doesn't exist ─────
    create_readonly_user
}

if $DO_INFRA; then
    run_infra
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
    log_info "Ensure Cloud SQL Proxy is running if targeting GCP."
    echo ""

    # Export DB vars so run-migrations.sh can pick them up
    export DB_HOST="${MIGRATION_DB_HOST:-127.0.0.1}"
    export DB_PORT="${MIGRATION_DB_PORT:-3306}"
    export MYSQL_DATABASE="${MIGRATION_DB_NAME}"

    "$migration_script" "$ENV" "${MIGRATION_DB_USER:-root}" "${MIGRATION_DB_PASSWORD}"

    log_success "Migrations complete."
    echo ""
}

if $DO_MIGRATE; then
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

    log_info "Provisioning Superset dashboards for environment: $ENV"

    # Generate a temporary .env file for the provisioning script
    local prov_env_file
    prov_env_file="$(mktemp)"
    trap 'rm -f "$prov_env_file"' EXIT

    # Générer DB_SQLALCHEMY_URI à partir des composants
    local DB_SQLALCHEMY_URI="mysql+mysqldb://${RCQ_DB_USER}:${RCQ_DB_PASSWORD}@${RCQ_DB_HOST}:${RCQ_DB_PORT}/${RCQ_DB_NAME}"

    cat > "$prov_env_file" <<PROV_EOF
SUPERSET_URL=${SUPERSET_URL}
SUPERSET_ADMIN_USER=${SUPERSET_ADMIN_USERNAME:-admin}
SUPERSET_ADMIN_PASSWORD=${SUPERSET_ADMIN_PASSWORD}
DB_CONNECTION_NAME=${DB_CONNECTION_NAME:-RCQ MySQL}
DB_SQLALCHEMY_URI=${DB_SQLALCHEMY_URI}
EMBEDDING_ALLOWED_DOMAINS=${EMBEDDING_ALLOWED_DOMAINS:-}
BACKEND_ENV_PATH=
PROV_EOF

    # Copy temp file to provisioning dir as .env.{env}
    cp "$prov_env_file" "$SCRIPT_DIR/superset/provisioning/.env.${ENV}"

    cd "$SCRIPT_DIR/superset/provisioning"
    python3 scripts/provision_superset.py --env "$ENV" --force-update --auto-restart --no-restart
    cd "$SCRIPT_DIR"

    # Clean up generated provisioning env file
    rm -f "$SCRIPT_DIR/superset/provisioning/.env.${ENV}"

    log_success "Superset dashboards provisioned."
    echo ""
}

if $DO_PROVISION; then
    run_provision
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
echo ""

# Show Terraform outputs if infra was applied
if $DO_INFRA && ! $PLAN_ONLY; then
    echo "  📍 Service URLs:"
    cd "$SCRIPT_DIR/infra"
    TF_FRONTEND_URL="$(terraform output -raw frontend_url 2>/dev/null || echo 'N/A')"
    TF_API_URL="$(terraform output -raw api_url 2>/dev/null || echo 'N/A')"
    TF_SUPERSET_URL="$(terraform output -raw superset_url 2>/dev/null || echo 'N/A')"
    cd "$SCRIPT_DIR"
    echo "    Frontend:  $TF_FRONTEND_URL"
    echo "    API:       $TF_API_URL"
    echo "    Superset:  $TF_SUPERSET_URL"
    echo ""

    echo "  🌐 DNS CNAME records to configure:"
    FRONTEND_DOMAIN="$(grep -E '^frontend_domain' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)"/\1/')"
    API_DOMAIN="$(grep -E '^api_domain' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)"/\1/')"
    SUPERSET_DOMAIN="$(grep -E '^superset_domain' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)"/\1/')"
    echo "    ${FRONTEND_DOMAIN:-N/A}  → ghs.googlehosted.com."
    echo "    ${API_DOMAIN:-N/A}       → ghs.googlehosted.com."
    echo "    ${SUPERSET_DOMAIN:-N/A}  → ghs.googlehosted.com."
    echo ""
fi

echo "  🔧 Superset admin access:"
echo "    gcloud run services proxy rcq-superset --region ${GCP_REGION} --project ${GCP_PROJECT_ID} --port 8088"
echo ""

$DO_CHECK    && log_success "Environment check: done"
$DO_BUILD    && log_success "Build & push: done"
$DO_INFRA    && { $PLAN_ONLY && log_success "Terraform plan: done" || log_success "Terraform apply: done"; }
$DO_MIGRATE  && log_success "Migrations: done"
$DO_PROVISION && log_success "Provisioning: done"

echo ""
log_success "Deployment complete for ${ENV}!"
#!/usr/bin/env bash
# ============================================================
# gcp-deploy.sh — Unified GCP deployment script for RedCrossQuest V2
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
#   --all            Do everything (build + infra + migrate + provision)
#   --plan           Terraform plan only (dry run)
#   --skip-confirm   Skip confirmation prompts
#   --help           Show this help message
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGION="europe-west1"

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

Environments:
  dev       Development environment
  test      Test/staging environment
  prod      Production environment

Options:
  --build          Build and push Docker images to Artifact Registry
  --infra          Apply Terraform infrastructure changes
  --migrate        Run SQL migrations via scripts/run-migrations.sh
  --provision      Provision Superset dashboards
  --all            Run all steps: build + infra + migrate + provision
  --plan           Terraform plan only (dry run, no apply)
  --skip-confirm   Skip confirmation prompts
  --help           Show this help message

Examples:
  ./gcp-deploy.sh dev --plan           # Dry run: show Terraform plan
  ./gcp-deploy.sh dev --build          # Build and push Docker images
  ./gcp-deploy.sh dev --infra          # Apply infrastructure changes
  ./gcp-deploy.sh dev --migrate        # Run database migrations
  ./gcp-deploy.sh dev --all            # Full deployment
  ./gcp-deploy.sh prod --all --skip-confirm  # Full prod deploy, no prompts
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
PLAN_ONLY=false
SKIP_CONFIRM=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --build)       DO_BUILD=true;     shift ;;
        --infra)       DO_INFRA=true;     shift ;;
        --migrate)     DO_MIGRATE=true;   shift ;;
        --provision)   DO_PROVISION=true; shift ;;
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

if ! $DO_BUILD && ! $DO_INFRA && ! $DO_MIGRATE && ! $DO_PROVISION; then
    log_error "No action specified. Use --build, --infra, --migrate, --provision, --all, or --plan."
    echo "Run './gcp-deploy.sh --help' for usage."
    exit 1
fi

# ── Derived variables ──────────────────────────────────────
GIT_SHA_SHORT="$(git -C "$SCRIPT_DIR" rev-parse --short HEAD)"
IMAGE_TAG="${ENV}-${GIT_SHA_SHORT}"

# Load project_id from tfvars
TFVARS_FILE="$SCRIPT_DIR/infra/env/${ENV}.tfvars"
if [ ! -f "$TFVARS_FILE" ]; then
    log_error "Terraform vars file not found: $TFVARS_FILE"
    exit 1
fi

PROJECT_ID="$(grep -E '^project_id\s*=' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)"/\1/')"
if [ -z "$PROJECT_ID" ]; then
    log_error "Could not extract project_id from $TFVARS_FILE"
    exit 1
fi

REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/rcq-docker"

# ── Validation ──────────────────────────────────────────────
validate_prerequisites() {
    log_info "Validating prerequisites..."
    local missing=false

    for cmd in gcloud terraform docker git; do
        if ! command -v "$cmd" &>/dev/null; then
            log_error "$cmd is not installed or not in PATH"
            missing=true
        fi
    done

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
echo "  Project:      $PROJECT_ID"
echo "  Image tag:    $IMAGE_TAG"
echo "  Registry:     $REGISTRY"
echo ""
echo "  Steps:"
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
# Step 1: Build & Push Docker images
# ══════════════════════════════════════════════════════════════
build_and_push() {
    echo "═══════════════════════════════════════════════"
    log_info "Step: Build & Push Docker images"
    echo "═══════════════════════════════════════════════"
    echo ""

    # Configure Docker for Artifact Registry
    log_info "Configuring Docker for Artifact Registry..."
    gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

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

    # Update image tags in tfvars if we just built
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

    local migration_script="$SCRIPT_DIR/scripts/run-migrations.sh"
    if [ ! -x "$migration_script" ]; then
        log_error "Migration script not found or not executable: $migration_script"
        log_info "Run: chmod +x scripts/run-migrations.sh"
        exit 1
    fi

    log_info "Running migrations for environment: $ENV"
    log_info "Note: For GCP environments, ensure Cloud SQL Proxy is running"
    log_info "  or set DB_HOST/DB_PORT environment variables."
    echo ""

    "$migration_script" "$ENV"

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

    if ! command -v python3 &>/dev/null; then
        log_error "python3 is required for provisioning. Please install Python 3."
        exit 1
    fi

    log_info "Provisioning Superset dashboards for environment: $ENV"

    cd "$SCRIPT_DIR/superset/provisioning"
    python3 scripts/provision_superset.py --env "$ENV" --force-update --auto-restart --no-restart
    cd "$SCRIPT_DIR"

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
echo "  Project:      $PROJECT_ID"
echo "  Image tag:    $IMAGE_TAG"
echo ""

# Show Terraform outputs if infra was applied
if $DO_INFRA && ! $PLAN_ONLY; then
    echo "  📍 Service URLs:"
    cd "$SCRIPT_DIR/infra"
    FRONTEND_URL="$(terraform output -raw frontend_url 2>/dev/null || echo 'N/A')"
    API_URL="$(terraform output -raw api_url 2>/dev/null || echo 'N/A')"
    SUPERSET_URL="$(terraform output -raw superset_url 2>/dev/null || echo 'N/A')"
    cd "$SCRIPT_DIR"
    echo "    Frontend:  $FRONTEND_URL"
    echo "    API:       $API_URL"
    echo "    Superset:  $SUPERSET_URL"
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
echo "    gcloud run services proxy rcq-superset --region ${REGION} --project ${PROJECT_ID} --port 8088"
echo ""

$DO_BUILD    && log_success "Build & push: done"
$DO_INFRA    && { $PLAN_ONLY && log_success "Terraform plan: done" || log_success "Terraform apply: done"; }
$DO_MIGRATE  && log_success "Migrations: done"
$DO_PROVISION && log_success "Provisioning: done"

echo ""
log_success "Deployment complete for ${ENV}!"

#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Parse arguments
SKIP_BUILD=false
for arg in "$@"; do
    case $arg in
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
    esac
done

echo -e "${GREEN}🚀 RCQ-V2 Local Development Environment${NC}"
echo "=========================================="
if [ "$SKIP_BUILD" = true ]; then
    echo -e "${YELLOW}   (--skip-build: skipping Docker image rebuild)${NC}"
fi

# Track background PIDs
PIDS=()

# Track service statuses
MYSQL_OK=false
SUPERSET_OK=false
BACKEND_OK=false
FRONTEND_OK=false
HAS_FRONTEND=false

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Shutting down services...${NC}"
    # Stop docker services
    docker compose -f superset/docker-compose.yml down 2>/dev/null || true
    # Kill background processes
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    jobs -p | xargs -r kill 2>/dev/null || true
    echo -e "${GREEN}✅ All services stopped${NC}"
    exit 0
}
trap cleanup SIGINT SIGTERM

# Check prerequisites
check_prereqs() {
    local missing=0
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker is required but not installed${NC}"
        missing=1
    fi
    if ! command -v poetry &> /dev/null; then
        echo -e "${RED}❌ Poetry is required but not installed${NC}"
        missing=1
    fi
    if ! command -v curl &> /dev/null; then
        echo -e "${RED}❌ curl is required but not installed${NC}"
        missing=1
    fi
    if [ "$missing" -eq 1 ]; then
        exit 1
    fi
    echo -e "${GREEN}✅ Prerequisites OK${NC}"
}

# Wait for a service to respond on an HTTP endpoint
wait_for_service() {
    local name=$1
    local url=$2
    local max_attempts=${3:-30}
    local attempt=1

    echo -n "   ⏳ Waiting for $name..."
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            echo -e " ${GREEN}✅${NC}"
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    echo -e " ${RED}❌ Timeout after $((max_attempts * 2))s${NC}"
    return 1
}

# Wait for MySQL to be ready via docker exec
wait_for_mysql() {
    local max_attempts=30
    local attempt=1
    echo -n "   ⏳ Waiting for MySQL..."
    while [ $attempt -le $max_attempts ]; do
        if docker exec rcq_mysql mysqladmin ping -h localhost -u root -p"${MYSQL_ROOT_PASSWORD:-rcq_root_password}" --silent 2>/dev/null; then
            echo -e " ${GREEN}✅${NC}"
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    echo -e " ${RED}❌ Timeout after $((max_attempts * 2))s${NC}"
    return 1
}

# Create MySQL readonly user if it doesn't exist
setup_mysql_user() {
    echo -n "   🔧 Checking MySQL rcq_readonly user..."
    if docker exec rcq_mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD:-rcq_root_password}" \
        -e "CREATE USER IF NOT EXISTS 'rcq_readonly'@'%' IDENTIFIED BY '${MYSQL_PASSWORD:-rcq_password}'; \
            GRANT SELECT ON ${MYSQL_DATABASE:-rcq_fr_dev_db}.* TO 'rcq_readonly'@'%'; \
            FLUSH PRIVILEGES;" 2>/dev/null; then
        echo -e " ${GREEN}✅ ready${NC}"
    else
        echo -e " ${YELLOW}⚠️  could not configure (non-fatal)${NC}"
    fi
}

# Start Superset (MySQL + Superset + Celery + Valkey)
start_superset() {
    echo -e "\n${GREEN}🐳 Starting Superset stack...${NC}"
    if [ ! -f superset/.env ]; then
        echo -e "${YELLOW}⚠️  superset/.env not found. Copying from .env.example${NC}"
        cp superset/.env.example superset/.env
        echo -e "${YELLOW}   Please edit superset/.env with your credentials${NC}"
    fi
    if [ "$SKIP_BUILD" = true ]; then
        docker compose -f superset/docker-compose.yml up -d
    else
        docker compose -f superset/docker-compose.yml up -d --build
    fi
    echo -e "${GREEN}   Superset stack started in background${NC}"
}

# Start Backend
start_backend() {
    echo -e "\n${GREEN}🐍 Starting FastAPI Backend...${NC}"
    cd backend
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            echo -e "${YELLOW}⚠️  backend/.env not found. Copying from .env.example${NC}"
            cp .env.example .env
            echo -e "${YELLOW}   Please edit backend/.env with your credentials${NC}"
        fi
    fi
    poetry install --quiet
    poetry run uvicorn src.main:app --reload --host 0.0.0.0 --port 8010 &
    local pid=$!
    PIDS+=($pid)
    cd "$SCRIPT_DIR"
    echo -e "${GREEN}   Backend started (PID: $pid)${NC}"
}

# Start Frontend (if exists)
start_frontend() {
    if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
        HAS_FRONTEND=true
        echo -e "\n${GREEN}🅰️  Starting Angular Frontend...${NC}"
        cd frontend
        npm install --silent
        npm start &
        local pid=$!
        PIDS+=($pid)
        cd "$SCRIPT_DIR"
        echo -e "${GREEN}   Frontend started (PID: $pid)${NC}"
    else
        echo -e "\n${YELLOW}ℹ️  Frontend not found (frontend/ directory missing)${NC}"
        echo "   Will be available after Wave 4"
    fi
}

# Print final status table
print_status_table() {
    local mysql_status superset_status backend_status frontend_status
    if [ "$MYSQL_OK" = true ]; then mysql_status="${GREEN}✅ OK${NC}"; else mysql_status="${RED}❌ FAIL${NC}"; fi
    if [ "$SUPERSET_OK" = true ]; then superset_status="${GREEN}✅ OK${NC}"; else superset_status="${RED}❌ FAIL${NC}"; fi
    if [ "$BACKEND_OK" = true ]; then backend_status="${GREEN}✅ OK${NC}"; else backend_status="${RED}❌ FAIL${NC}"; fi

    echo ""
    echo "=========================================="
    echo -e "${GREEN}Service Status:${NC}"
    echo ""
    printf "   %-14s %-10b %s\n" "MySQL" "$mysql_status" "localhost:3316"
    printf "   %-14s %-10b %s\n" "Superset" "$superset_status" "http://localhost:8088"
    printf "   %-14s %-10b %s\n" "Backend API" "$backend_status" "http://localhost:8010"
    printf "   %-14s %-10b %s\n" "API Docs" "$backend_status" "http://localhost:8010/docs"

    if [ "$HAS_FRONTEND" = true ]; then
        if [ "$FRONTEND_OK" = true ]; then frontend_status="${GREEN}✅ OK${NC}"; else frontend_status="${RED}❌ FAIL${NC}"; fi
        printf "   %-14s %-10b %s\n" "Frontend" "$frontend_status" "http://localhost:4210"
    fi

    echo ""

    # Check if all critical services are up
    if [ "$MYSQL_OK" = true ] && [ "$SUPERSET_OK" = true ] && [ "$BACKEND_OK" = true ]; then
        if [ "$HAS_FRONTEND" = true ] && [ "$FRONTEND_OK" = true ]; then
            echo -e "${GREEN}🎉 All services ready! Open http://localhost:4210${NC}"
        elif [ "$HAS_FRONTEND" = false ]; then
            echo -e "${GREEN}🎉 All services ready! Open http://localhost:8088${NC}"
        else
            echo -e "${YELLOW}⚠️  Some services failed to start. Check logs above.${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Some services failed to start. Check logs above.${NC}"
    fi

    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
    echo "=========================================="
}

# =============================================
# Main
# =============================================
check_prereqs
start_superset

# Wait for MySQL before setting up user
if wait_for_mysql; then
    MYSQL_OK=true
    setup_mysql_user
fi

# Wait for Superset
if wait_for_service "Superset" "http://localhost:8088/health" 45; then
    SUPERSET_OK=true
fi

start_backend

# Wait for Backend
if wait_for_service "Backend" "http://localhost:8010/health" 30; then
    BACKEND_OK=true
fi

start_frontend

# Wait for Frontend (if present)
if [ "$HAS_FRONTEND" = true ]; then
    if wait_for_service "Frontend" "http://localhost:4210" 30; then
        FRONTEND_OK=true
    fi
fi

# Final status
print_status_table

# Wait for background processes
wait

#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${GREEN}🚀 RCQ-V2 Local Development Environment${NC}"
echo "=========================================="

# Track background PIDs
PIDS=()

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Shutting down services...${NC}"
    # Stop docker services
    docker compose -f metabase/docker-compose.yml down 2>/dev/null || true
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
    if [ "$missing" -eq 1 ]; then
        exit 1
    fi
    echo -e "${GREEN}✅ Prerequisites OK${NC}"
}

# Start Metabase
start_metabase() {
    echo -e "\n${GREEN}🐳 Starting Metabase...${NC}"
    if [ ! -f metabase/.env ]; then
        echo -e "${YELLOW}⚠️  metabase/.env not found. Copying from .env.example${NC}"
        cp metabase/.env.example metabase/.env
        echo -e "${YELLOW}   Please edit metabase/.env with your credentials${NC}"
    fi
    docker compose -f metabase/docker-compose.yml up -d --build
    echo -e "${GREEN}   Metabase started in background${NC}"
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
    PIDS+=($!)
    cd "$SCRIPT_DIR"
    echo -e "${GREEN}   Backend started (PID: ${PIDS[-1]})${NC}"
}

# Start Frontend (if exists)
start_frontend() {
    if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
        echo -e "\n${GREEN}🅰️  Starting Angular Frontend...${NC}"
        cd frontend
        npm install --silent
        npm start &
        PIDS+=($!)
        cd "$SCRIPT_DIR"
        echo -e "${GREEN}   Frontend started (PID: ${PIDS[-1]})${NC}"
    else
        echo -e "\n${YELLOW}ℹ️  Frontend not found (frontend/ directory missing)${NC}"
        echo "   Will be available after Wave 4"
    fi
}

# Main
check_prereqs
start_metabase
start_backend
start_frontend

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Services running:${NC}"
echo "   🐳 Metabase:  http://localhost:3010"
echo "   🐍 Backend:   http://localhost:8010"
echo "   📚 API Docs:  http://localhost:8010/docs"
if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
    echo "   🅰️  Frontend:  http://localhost:4210"
fi
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo "=========================================="

# Wait for background processes
wait

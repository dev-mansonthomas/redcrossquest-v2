#!/bin/bash

# RCQ V2 - Local Development Environment Launcher
# This script starts the entire development stack using Docker Compose

set -e

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
    if docker exec rcq_mysql mysqladmin ping -h localhost -u root -prcq_root_password --silent 2>/dev/null; then
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
docker exec rcq_mysql mysql -u root -prcq_root_password -e \
    "CREATE USER IF NOT EXISTS 'rcq_readonly'@'%' IDENTIFIED BY 'rcq_password'; \
     GRANT SELECT ON rcq_fr_dev_db.* TO 'rcq_readonly'@'%'; \
     FLUSH PRIVILEGES;" 2>/dev/null || true

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

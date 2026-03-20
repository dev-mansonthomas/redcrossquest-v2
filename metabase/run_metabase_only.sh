#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "🔄 Stopping existing containers..."
docker compose down

echo "🔨 Building (pulling latest base images)..."
docker compose build --pull

echo "🚀 Starting services..."
docker compose up -d

echo ""
echo "✅ Metabase is starting up!"
echo "   URL: http://localhost:3010"
echo ""
echo "📋 Logs (Ctrl+C to exit logs, services continue running):"
docker compose logs -f

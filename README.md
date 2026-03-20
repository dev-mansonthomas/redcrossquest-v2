# red-cross-quest-v2

A new project created with Intent by Augment.

## Local Development

### Prerequisites

- **Docker** + Docker Compose
- **Poetry** (Python package manager, for the backend)
- **Node.js** (for the frontend, when available)

### Quick Start

```bash
# Start all services
./run_local.sh
```

This will launch:

| Service    | URL                          | Notes                        |
|------------|------------------------------|------------------------------|
| Superset   | http://localhost:8088         | Analytics dashboards         |
| MySQL      | localhost:3316               | Database                     |
| Backend    | http://localhost:8010         | FastAPI REST API             |
| API Docs   | http://localhost:8010/docs    | Swagger UI                   |
| Frontend   | http://localhost:4210         | Angular (when available)     |

Press **Ctrl+C** to stop all services.

### Running individual services

```bash
# MySQL only
cd superset && docker compose up -d mysql

# Superset full stack
cd superset && docker compose up -d --build

# Backend only
cd backend && poetry run uvicorn src.main:app --reload --host 0.0.0.0 --port 8010
```

### Environment files

Each service has its own `.env` file (auto-copied from `.env.example` on first run):
- `superset/.env` — MySQL, Superset & Valkey credentials
- `backend/.env` — Backend configuration

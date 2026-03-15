# RedCrossQuest V2 API

FastAPI backend for RedCrossQuest V2 Dashboards application.

## Features

- **Health Check**: `/health` endpoint for Cloud Run health monitoring
- **Authentication**: `/api/me` endpoint (Google OAuth in Wave 2)
- **Metabase Embed**: `/api/embed/{dashboard_key}` endpoint (JWT signing in Wave 2)
- **MySQL Integration**: SQLAlchemy with read-only access to RCQ database
- **Environment Configuration**: Multi-environment support (dev/test/prod)
- **Cloud Run Ready**: Optimized Dockerfile with health checks

## Project Structure

```
backend/
├── src/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Environment configuration
│   ├── database.py          # SQLAlchemy setup
│   ├── models/              # Database models
│   │   ├── __init__.py
│   │   └── user.py
│   ├── schemas/             # Pydantic schemas
│   │   ├── __init__.py
│   │   └── user.py
│   └── routers/             # API endpoints
│       ├── __init__.py
│       ├── health.py
│       ├── auth.py
│       └── embed.py
├── tests/                   # Unit tests
├── pyproject.toml           # Poetry dependencies
├── Dockerfile               # Cloud Run deployment
└── .env.example             # Environment template
```

## Setup

### Prerequisites

- Python 3.11+
- Poetry
- MySQL 8 (for local development)

### Installation

1. Install dependencies:
```bash
cd backend
poetry install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. Run the application:
```bash
poetry run uvicorn src.main:app --reload --port 8080
```

## Testing

Run tests:
```bash
poetry run pytest
```

Run tests with coverage:
```bash
poetry run pytest --cov=src --cov-report=html
```

## Docker

Build the image:
```bash
docker build -t rcq-api .
```

Run the container:
```bash
docker run -p 8080:8080 --env-file .env rcq-api
```

## API Endpoints

### Health Check
- `GET /health` - Returns application health status

### Authentication (Wave 1: Mock Data)
- `GET /api/me` - Get current user information

### Metabase Embed (Wave 1: Placeholder)
- `GET /api/embed/{dashboard_key}` - Get signed embed URL for dashboard

Valid dashboard keys:
- `cumul-journalier`
- `kpi-annuels`
- `comptage-tresorier`
- `leaderboard`

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `ENVIRONMENT`: dev/test/prod
- `RCQ_DB_HOST`: MySQL host
- `RCQ_DB_NAME`: Database name
- `RCQ_DB_USER`: Database user (read-only)
- `RCQ_DB_PASSWORD`: Database password

## Wave 2 Features (Upcoming)

- Google OAuth 2.0 authentication
- JWT-signed Metabase embed URLs
- UL-based filtering in embed URLs
- Role-based access control


# RCQ V2 — Superset + MySQL Local Setup

## Quick Start

### Phase 1: MySQL only

```bash
cd superset
cp .env.example .env   # Edit credentials as needed
docker compose up -d mysql
```

MySQL is available at `localhost:3316` (user: `rcq_readonly` / password from `.env`).

### Load production data

Place SQL dump files in `sql-imports/` **before** first `docker compose up`:
```bash
cp /path/to/dump.sql superset/sql-imports/
docker compose up -d mysql   # Files in sql-imports/ are auto-loaded on first start
```

To load data into an **existing** container:
```bash
docker exec -i rcq_mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" rcq_fr_dev_db < dump.sql
```

### Phase 2: Full stack (Superset + Celery + Valkey)

```bash
docker compose up -d --build
```

| Service          | URL                        |
|------------------|----------------------------|
| MySQL            | `localhost:3316`           |
| Superset         | http://localhost:8088      |
| Valkey (Redis)   | `localhost:6379`           |

Default Superset login: `admin` / `admin`

## Valkey database allocation

| Base | Usage                              |
|------|------------------------------------|
| 0    | Reserved for FastAPI (sessions)    |
| 1    | Superset (cache, Celery broker)    |

## Architecture

- **MySQL 8.0**: Production data (port 3316 → 3306)
- **Apache Superset**: Dashboards & analytics (port 8088)
- **Celery Worker**: Async SQL queries & scheduled reports
- **Valkey 8**: Cache + Celery broker (Redis-compatible)

## Connecting Superset to MySQL

1. Open http://localhost:8088 → Settings → Database Connections
2. Add database with SQLAlchemy URI:
   ```
   mysql://rcq_readonly:<YOUR_PASSWORD>@mysql:3306/rcq_fr_dev_db
   ```

## Troubleshooting

```bash
# Check service status
docker compose ps

# View logs
docker compose logs -f superset
docker compose logs -f mysql

# Restart everything
docker compose down && docker compose up -d --build

# Reset all data (⚠️ destructive)
docker compose down -v
```

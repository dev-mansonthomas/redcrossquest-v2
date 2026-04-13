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

Place SQL dump files in `dev-sql-import/` **before** first `docker compose up`:

```bash
cp /path/to/dump.sql superset/dev-sql-import/
docker compose up -d mysql   # Files in dev-sql-import/ are auto-loaded on first start
```

To load data into an **existing** container:

```bash
docker exec -i rcq_mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" rcq_fr_dev_db < dump.sql
```

### Phase 2: Full stack (Superset + Celery + Valkey)

```bash
docker compose up -d --build
```

| Service | URL |
| --- | --- |
| MySQL | localhost:3316 |
| Superset | http://localhost:8088 |
| Valkey (Redis) | localhost:6389 |

Default Superset login: `admin` / `admin`

## Valkey database allocation

| Base | Projet | Usage |
| --- | --- | --- |
| 0 | CLEF | ⚠️ Réservé (autre projet) |
| 1 | RCQ | Superset (cache, Celery broker) |

> Note : La base 0 est utilisée par le projet CLEF sur ce poste de développement.Les projets seront séparés à terme (instances Valkey distinctes par projet).

### Configuration

Le numéro de base est configurable via `VALKEY_DB` dans `.env` :

```env
VALKEY_DB=1  # Base par défaut pour Superset
```

## Architecture

- **MySQL 8.0**: Production data (port 3316 → 3306)
- **Apache Superset**: Dashboards & analytics (port 8088)
- **Celery Worker**: Async SQL queries & scheduled reports
- **Valkey 8**: Cache + Celery broker (Redis-compatible)

## Connecting Superset to MySQL

1. Open [http://localhost:8088](http://localhost:8088) → Settings → Database Connections
2. Add database with SQLAlchemy URI:`mysql://rcq_readonly:<YOUR_PASSWORD>@mysql:3306/rcq_fr_dev_db`

## MySQL User Setup

Create the read-only user for Superset:

```bash
# From host (outside container)
docker exec -i rcq_mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" < superset/config/create_readonly_user.sql

# Or connect to MySQL and run manually
docker exec -it rcq_mysql mysql -u root -p
# Then paste the SQL commands
```

See `superset/config/create_readonly_user.sql` for the full script.

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
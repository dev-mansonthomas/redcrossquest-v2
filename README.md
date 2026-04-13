# red-cross-quest-v2

A new project created with Intent by Augment.

## Local Development

### Prerequisites

- **Docker** + Docker Compose
- **Poetry** (Python package manager, for the backend)
- **Node.js** (for the frontend, when available)

### First-time setup

```bash
# Initialize the database with sample data
./run_local.sh --init-db
```

### Regular usage

```bash
# Start without re-initializing (preserves your data)
./run_local.sh
```

### Flags

| Flag | Description |
| --- | --- |
| --init-db | Initialize/reset the database with SQL dumps from superset/dev-sql-import/ and migrations from superset/deploy-sql/ |

### ⚠️ Database Reset

To completely reset the database:

```bash
# 1. Stop all containers
docker compose -p rcq down

# 2. Remove the MySQL volume (⚠️ DELETES ALL DATA)
docker volume rm rcq_mysql_data

# 3. Restart with initialization
./run_local.sh --init-db
```

This will launch:

| Service | URL | Notes |
| --- | --- | --- |
| Superset | http://localhost:8088 | Analytics dashboards |
| MySQL | localhost:3316 | Database |
| Backend | http://localhost:8010 | FastAPI REST API |
| API Docs | http://localhost:8010/docs | Swagger UI |
| Frontend | http://localhost:4210 | Angular (when available) |

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

## Deployment

### Domain Verification

The Google account used for deployment (e.g. `xxx@croix-rouge.fr`) must be a **verified owner** of the `redcrossquest.com` domain in [Google Search Console](https://search.google.com/search-console).

This is required for Cloud Run domain mappings to work. Without it, `terraform apply` will fail with:

```
Caller is not authorized to administer the domain
```

**To add a new deployer:**

1. Go to [Google Search Console](https://search.google.com/search-console) → Settings → Users and permissions
2. Sign in with an account that is already a verified owner of `redcrossquest.com`
3. Click "Add a user"
4. Enter the deployer's email (e.g. `thomas.manson@croix-rouge.fr`)
5. Set permission to **Owner**
6. The new deployer can now run `gcp-deploy.sh` with domain mappings

### Google OAuth Credentials

Each environment requires its own OAuth redirect URIs. In [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials):

1. Select your OAuth 2.0 Client ID
2. Add the following URIs:

**Authorized JavaScript origins:**

| Environment | Origins |
| --- | --- |
| Local dev | http://localhost:4200, http://localhost:8010 |
| Dev (GCP) | https://dev.graph.redcrossquest.com, https://dev.back.graph.redcrossquest.com |
| Prod (GCP) | https://graph.redcrossquest.com, https://back.graph.redcrossquest.com |

**Authorized redirect URIs:**

| Environment | Redirect URI |
| --- | --- |
| Local dev | http://localhost:8010/api/auth/callback |
| Dev (GCP) | https://dev.back.graph.redcrossquest.com/api/auth/callback |
| Prod (GCP) | https://back.graph.redcrossquest.com/api/auth/callback |

> Important: Without these URIs, Google will return a redirect_uri_mismatch error (400) when users try to log in.

## License

Ce projet est sous licence [GNU General Public License v3.0](LICENSE).
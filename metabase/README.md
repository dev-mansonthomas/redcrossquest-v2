# Metabase Docker Setup for RedCrossQuest V2

This directory contains the Docker configuration for running Metabase with MySQL persistence, optimized for Google Cloud Run deployment.

## Architecture

- **Metabase Application Database**: `rcq_metabase_db` schema in MySQL 8
- **RCQ Data Source**: Read-only connection to `rcq_fr_*_db` schemas
- **Deployment Target**: Google Cloud Run with Cloud SQL MySQL instance

## Local Development Setup

### Prerequisites

- Docker and Docker Compose installed
- MySQL client (for running the read-only user creation script)

### Quick Start

1. **Copy environment file**:
   ```bash
   cd metabase
   cp .env.example .env
   ```

2. **Edit `.env` file** with your credentials:
   - Set strong passwords for `MB_DB_PASS` and `MYSQL_ROOT_PASSWORD`
   - Generate a random key for `MB_EMBEDDING_SECRET_KEY` (e.g., `openssl rand -hex 32`)

3. **Start services**:
   ```bash
   docker-compose up -d
   ```

4. **Access Metabase**:
   - Open http://localhost:3000
   - Complete initial setup wizard
   - Create admin account

5. **Create read-only user** (for RCQ data access):
   ```bash
   chmod +x init-scripts/03-create-readonly-user.sh
   ./init-scripts/03-create-readonly-user.sh
   ```

6. **Configure RCQ data source in Metabase**:
   - Go to Settings → Admin → Databases → Add Database
   - Type: MySQL
   - Host: `rcq_mysql` (or Cloud SQL instance for production)
   - Port: 3306
   - Database: `rcq_fr_dev_db`
   - Username: `rcq_readonly_user`
   - Password: [from step 5]

### Stopping Services

```bash
docker-compose down
```

To remove volumes (⚠️ deletes all data):
```bash
docker-compose down -v
```

## Cloud Run Deployment

### Environment Variables Required

Set these in Cloud Run service configuration:

```bash
MB_DB_TYPE=mysql
MB_DB_DBNAME=rcq_metabase_db
MB_DB_PORT=3306
MB_DB_USER=rcq_metabase_user
MB_DB_PASS=<from Secret Manager>
MB_DB_HOST=<Cloud SQL instance connection>
MB_SITE_URL=https://your-metabase-url.run.app
MB_EMBEDDING_SECRET_KEY=<from Secret Manager>
```

### Build and Push Image

```bash
# Build for Cloud Run
docker build -t gcr.io/rcq-fr-dev/rcq-metabase:latest .

# Push to Google Container Registry
docker push gcr.io/rcq-fr-dev/rcq-metabase:latest
```

### Deploy to Cloud Run

```bash
gcloud run deploy rcq-metabase \
  --image gcr.io/rcq-fr-dev/rcq-metabase:latest \
  --platform managed \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars MB_DB_TYPE=mysql,MB_DB_DBNAME=rcq_metabase_db \
  --set-secrets MB_DB_PASS=metabase-db-password:latest,MB_EMBEDDING_SECRET_KEY=metabase-embed-key:latest \
  --add-cloudsql-instances <PROJECT>:<REGION>:<INSTANCE> \
  --memory 2Gi \
  --cpu 1 \
  --max-instances 3
```

## Database Schema

### Metabase Application Database (`rcq_metabase_db`)

Stores Metabase's own metadata:
- User accounts and permissions
- Dashboard definitions
- Saved questions and queries
- Collections and settings

### RCQ Data Source (`rcq_fr_*_db`)

Read-only access to RCQ operational data:
- `ul` - Unités Locales (Local Units)
- `queteur` - Collectors
- `point_quete` - Collection Points
- `tronc_queteur` - Collection Boxes
- `yearly_goal` - Annual Goals
- `daily_stats_before_rcq` - Historical Data

## Security Notes

- **Never commit `.env` file** - it's in `.gitignore`
- **Use Secret Manager** for production credentials
- **Read-only user** for RCQ data prevents accidental modifications
- **Interactive script** for user creation prevents password exposure in shell history
- **Health checks** ensure Cloud Run can monitor service health

## Troubleshooting

### Metabase won't start

Check logs:
```bash
docker-compose logs rcq_metabase
```

Common issues:
- Database connection failed: verify `MB_DB_*` environment variables
- Port already in use: change port mapping in `docker-compose.yml`

### Can't connect to RCQ database

Verify read-only user:
```bash
mysql -h localhost -u rcq_readonly_user -p rcq_fr_dev_db
```

### Health check failing

Test manually:
```bash
curl http://localhost:3000/api/health
```

## Next Steps

After Metabase is running:
1. Configure Google OAuth integration (Task 2.1)
2. Set up embed signing (Task 2.2)
3. Create the 4 priority dashboards (Tasks 3.1-3.4)


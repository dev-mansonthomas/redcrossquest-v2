# gcp-deploy.sh

## Description

Script de déploiement GCP pour RedCrossQuest V2. Orchestre le build des images Docker, le déploiement de l'infrastructure via Terraform, les migrations SQL et le provisioning des dashboards Superset. Supporte les déploiements partiels ou complets.

## Prérequis

- **Bash** (version 4+)
- **gcloud CLI** (authentifié avec un projet GCP)
- **Docker** (avec buildx)
- **Git**
- **Terraform** (requis pour `--infra`)
- **python3** (requis pour `--provision`)
- **cloud-sql-proxy** (requis pour `--infra`, `--migrate`, `--check`)
- **MySQL client** (requis pour `--infra` et `--check`)
- Un fichier de configuration `.env.<env>` à la racine du projet
- Un fichier Terraform `infra/env/<env>.tfvars`

## Usage

```bash
./gcp-deploy.sh <env> [options]
```

### Environnements

| Environnement | Description |
|---------------|-------------|
| `dev`  | Développement |
| `test` | Test / staging |
| `prod` | Production |

## Options

| Option | Description |
|--------|-------------|
| `--build` | Build et push des images Docker (standalone) |
| `--infra` | Applique Terraform (build auto des images avant) |
| `--skip-build` | Ignore le build automatique avec `--infra` |
| `--migrate` | Exécute les migrations SQL |
| `--provision` | Provisionne les dashboards Superset |
| `--check` | Vérifie l'état de l'environnement (lecture seule) |
| `--all` | Exécute tout : build + infra + migrate + provision |
| `--plan` | Terraform plan uniquement (dry run, sans build) |
| `--services LISTE` | Services à builder (séparés par virgule : `frontend,api,superset`) |
| `--skip-confirm` | Ignore les confirmations interactives |
| `--help` | Affiche l'aide |

## Exemples d'utilisation

```bash
# Dry run : afficher le plan Terraform
./gcp-deploy.sh dev --plan

# Builder et pusher les images Docker uniquement
./gcp-deploy.sh dev --build

# Builder les images + appliquer l'infrastructure
./gcp-deploy.sh dev --infra

# Appliquer l'infrastructure sans rebuilder les images
./gcp-deploy.sh dev --infra --skip-build

# Exécuter les migrations de base de données
./gcp-deploy.sh dev --migrate

# Déploiement complet
./gcp-deploy.sh dev --all

# Builder uniquement frontend et api
./gcp-deploy.sh dev --infra --services frontend,api

# Déploiement prod sans confirmation
./gcp-deploy.sh prod --all --skip-confirm

# Vérifier l'état de l'environnement
./gcp-deploy.sh dev --check
```

## Variables d'environnement

Chargées depuis `.env.<env>` :

| Variable | Requis | Description |
|----------|--------|-------------|
| `GCP_PROJECT_ID` | ✅ | ID du projet GCP |
| `GCP_REGION` | ❌ (défaut: `europe-west1`) | Région GCP |
| `AR_REPOSITORY` | ❌ (défaut: `rcq-docker`) | Nom du repository Artifact Registry |
| `CLOUD_SQL_CONNECTION_NAME` | ✅ (infra/migrate/check) | Nom de connexion Cloud SQL |
| `CLOUD_SQL_PROXY_PORT` | ❌ (défaut: `3305`) | Port du Cloud SQL Proxy |
| `MIGRATION_DB_PASSWORD` | ✅ (migrate/check) | Mot de passe BDD pour les migrations |
| `MIGRATION_DB_NAME` | ✅ (migrate/check) | Nom de la BDD |
| `MIGRATION_DB_USER` | ❌ (défaut: `root`) | Utilisateur BDD |
| `SUPERSET_URL` | ✅ (provision) | URL de Superset |
| `SUPERSET_ADMIN_PASSWORD` | ✅ (provision) | Mot de passe admin Superset |
| `RCQ_DB_USER` | ✅ (infra) | Utilisateur readonly MySQL |
| `RCQ_DB_PASSWORD` | ✅ (infra) | Mot de passe readonly MySQL |
| `SUPERSET_DB_RW_USER` | ✅ (infra) | Utilisateur RW Superset metadata |
| `SUPERSET_DB_RW_PASSWORD` | ✅ (infra) | Mot de passe RW Superset metadata |

## Étapes de déploiement

### Step 0 : `--check` — Vérification de l'environnement
Vérifie : projet GCP, bucket Terraform, APIs activées, Artifact Registry, Terraform init/validate, Cloud SQL Proxy, utilisateurs MySQL, tables, secrets, Memorystore Valkey.

### Step 1 : `--build` — Build & Push Docker
- Configure Docker pour Artifact Registry
- Build les images `linux/amd64` pour frontend, backend et superset
- Tag avec `<env>-<git-sha-court>`
- Push vers Artifact Registry

### Step 2 : `--infra` — Terraform
- Crée le bucket GCS pour l'état Terraform
- Phase 1 : Crée les secrets dans Secret Manager
- Phase 2 : Peuple les secrets depuis `.env`
- Phase 3 : `terraform apply` complet
- Crée les utilisateurs MySQL `rcq_readonly` et `rcq-graph` si inexistants
- Crée la base Superset metadata + utilisateur RW

### Step 3 : `--migrate` — Migrations SQL
Appelle `scripts/run-migrations.sh` avec les credentials appropriés.

### Step 4 : `--provision` — Provisioning Superset
- Génère les fichiers `.env` via `generate-env.sh`
- Exécute `provision_superset.py` avec `--force-update --auto-restart --no-restart`

## APIs GCP activées automatiquement

- `run.googleapis.com` (Cloud Run)
- `artifactregistry.googleapis.com` (Artifact Registry)
- `secretmanager.googleapis.com` (Secret Manager)
- `sqladmin.googleapis.com` (Cloud SQL Admin)
- `memorystore.googleapis.com` (Memorystore)

## Secrets créés dans Secret Manager

| Secret | Variable source |
|--------|----------------|
| `rcq_db_readonly_username` | `RCQ_DB_USER` |
| `rcq_db_readonly_password` | `RCQ_DB_PASSWORD` |
| `rcq_db_graph_username` | `RCQ_DB_USER` |
| `rcq_db_graph_password` | `RCQ_DB_PASSWORD` |
| `rcq_google_oauth_client_id` | `GOOGLE_OAUTH_CLIENT_ID` |
| `rcq_google_oauth_client_secret` | `GOOGLE_OAUTH_CLIENT_SECRET` |
| `rcq_superset_secret_key` | `SUPERSET_SECRET_KEY` |
| `rcq_superset_db_rw_username` | `SUPERSET_DB_RW_USER` |
| `rcq_superset_db_rw_password` | `SUPERSET_DB_RW_PASSWORD` |
| `rcq_superset_admin_password` | `SUPERSET_ADMIN_PASSWORD` |
| `rcq_jwt_secret_key` | `JWT_SECRET_KEY` |

## Notes

- Le Cloud SQL Proxy est démarré automatiquement si nécessaire et arrêté à la fin du script.
- En mode `--infra`, le build des images est automatique sauf si `--skip-build` est spécifié.
- Le tag des images est composé de `<env>-<sha-git-court>`.
- Un avertissement spécial est affiché pour les déploiements en `prod`.
- À la fin du déploiement, les fichiers `.env` locaux sont restaurés via `generate-env.sh local`.
- Les enregistrements CNAME DNS requis sont affichés avant la confirmation.

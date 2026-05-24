# run_local.sh

## Description

Lance l'environnement de développement local complet de RCQ V2 via Docker Compose. Démarre tous les services (Valkey, MySQL, Superset, backend, frontend), configure la base de données, et fournit des commandes utilitaires pour redémarrer des services individuels, initialiser la BDD ou provisionner les dashboards.

## Prérequis

- **Docker** (avec Docker Compose v2)
- Un fichier `.env` à la racine du projet (configuration locale)
- **python3** (requis pour `--provision`)
- **Google Cloud SDK** (`gcloud` et `gsutil`) authentifié, requis pour `--init-db`
- Un fichier `.env.prod` à la racine du projet contenant `RCQ_DB_NAME=<nom_base_prod>`. Cette variable est utilisée par `--init-db` pour l'export Cloud SQL et n'est pas exportée dans l'environnement local.

## Usage

```bash
./run_local.sh [OPTIONS]
```

## Options

| Option | Description |
|--------|-------------|
| *(aucune)* | Démarre tout l'environnement de développement |
| `--init-db` | Démarre + initialise la BDD. Par défaut: déclenche un export Cloud SQL de la prod vers GCS, télécharge le dump, puis l'importe localement (voir [Initialisation de la base de données](#initialisation-de-la-base-de-données---init-db)) |
| `--use-last-export` | (avec `--init-db`) Skip l'export Cloud SQL et utilise le dump GCS le plus récent déjà présent dans le bucket |
| `--restart <service>` | Redémarre un service avec `--force-recreate` |
| `--provision` | Provisionne les dashboards Superset (création) |
| `--provision --force-update` | Met à jour les dashboards existants |
| `--show-config` | Affiche la configuration actuelle |
| `--help` | Affiche l'aide |

### Services pour `--restart`

| Service | Description | Timeout |
|---------|-------------|---------|
| `backend` | Backend FastAPI | 60s |
| `frontend` | Frontend Angular | 120s |
| `superset` | Apache Superset (avec rebuild) | 90s |
| `all` | Tous les services | variable |

## Exemples d'utilisation

```bash
# Démarrer tout l'environnement
./run_local.sh

# Démarrer avec initialisation de la BDD (export prod automatique)
./run_local.sh --init-db

# Idem mais en réutilisant le dernier dump déjà présent sur GCS (pas de nouvel export)
./run_local.sh --init-db --use-last-export

# Redémarrer le backend uniquement
./run_local.sh --restart backend

# Redémarrer tous les services
./run_local.sh --restart all

# Provisionner les dashboards
./run_local.sh --provision

# Mettre à jour les dashboards existants
./run_local.sh --provision --force-update

# Afficher la configuration
./run_local.sh --show-config
```

## Séquence de démarrage

1. **Génération des `.env`** : Appelle `scripts/generate-env.sh local`
2. **Réseau Docker** : Crée le réseau `rcq_default`
3. **Arrêt** : Stoppe les conteneurs existants
4. **Valkey** : Démarre et attend le ping (30s max)
5. **Infrastructure** : Démarre MySQL et Superset via `superset/docker-compose.yml`
6. **MySQL** : Attend la disponibilité (60s max), configure l'utilisateur readonly
7. **Init DB** *(optionnel)* : Importe les dumps SQL si `--init-db`
8. **Superset** : Attend le health check (90s max)
9. **Application** : Démarre backend et frontend via `docker-compose.dev.yml`
10. **Backend** : Attend le health check sur `/health` (60s max)
11. **Frontend** : Attend la disponibilité (120s max)
12. **Provision** *(optionnel)* : Provisionne les dashboards si `--provision`

## Initialisation de la base de données (`--init-db`)

### Récupération du dump prod (automatique)

Avant tout import, `--init-db` télécharge un dump fraîchement exporté depuis la prod :

1. **Pre-flight** 🔍 : vérifie `gcloud`/`gsutil` dans le `PATH` et un compte gcloud actif (`gcloud auth list`).
2. **Lecture de `RCQ_DB_NAME`** depuis `.env.prod` (lecture isolée, pas d'export global).
3. **Export Cloud SQL** 📤 :
   - Par défaut: `gcloud sql export sql rcq-db-inst-fr-prod-0 gs://rcq-fr-prod.appspot.com/$(date +%Y-%m-%d)-RCQ-FR-PROD.sql --database=$RCQ_DB_NAME --project=rcq-fr-prod`
   - Avec `--use-last-export`: skip l'export, prend le dernier objet `*-RCQ-FR-PROD.sql` du bucket via `gsutil ls | sort -r | head -1`.
4. **Téléchargement local** 📥 : `gsutil cp` vers `superset/dev-sql-import/prod-data/` (le nom daté est conservé, ce qui construit un historique local).

Toute erreur de `gcloud`/`gsutil` interrompt le script (pas de `|| true`).

### Imports SQL

Une fois le dump rapatrié, les fichiers SQL suivants sont importés dans l'ordre :

| Fichier | Description |
|---------|-------------|
| `superset/dev-sql-import/prod-data/*-RCQ-FR-PROD.sql` (le plus récent) | Dump principal de la base, sélectionné via `ls -t ... \| head -1` |
| `superset/dev-sql-import/02-add-trigger.sql` | Trigger `tronc_queteur_update` |
| `superset/dev-sql-import/03-anonymise.sql` | Anonymisation des données sensibles |
| `superset/deploy-sql/01-quete-dates.sql` | Table `quete_dates` |
| `superset/deploy-sql/02-migrate-utf8mb4.sql` | Migration charset UTF-8 MB4 |

## URLs des services locaux

| Service | URL |
|---------|-----|
| Frontend | http://localhost:4210 |
| Backend | http://localhost:8010 |
| API Docs | http://localhost:8010/docs |
| Superset | http://localhost:8088 |
| MySQL | localhost:3316 |
| Valkey | localhost:6389 |

## Fichiers Docker Compose utilisés

| Fichier | Services |
|---------|----------|
| `docker-compose.dev.yml` | backend, frontend, valkey |
| `superset/docker-compose.yml` | superset, mysql |

## Notes

- ⚠️ La suppression de volumes Docker doit **toujours** avoir l'autorisation explicite de l'utilisateur (perte de données MySQL).
- Le hot-reload est activé pour le frontend et le backend.
- Le projet Docker Compose utilise le préfixe `-p rcq`.
- Si la base de données est vide et `--init-db` n'est pas utilisé, un avertissement est affiché.
- Le script crée automatiquement l'utilisateur MySQL readonly avec les privileges `SELECT`.

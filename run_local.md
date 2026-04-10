# run_local.sh

## Description

Lance l'environnement de développement local complet de RCQ V2 via Docker Compose. Démarre tous les services (Valkey, MySQL, Superset, backend, frontend), configure la base de données, et fournit des commandes utilitaires pour redémarrer des services individuels, initialiser la BDD ou provisionner les dashboards.

## Prérequis

- **Docker** (avec Docker Compose v2)
- Un fichier `.env` à la racine du projet (configuration locale)
- **python3** (requis pour `--provision`)

## Usage

```bash
./run_local.sh [OPTIONS]
```

## Options

| Option | Description |
|--------|-------------|
| *(aucune)* | Démarre tout l'environnement de développement |
| `--init-db` | Démarre + initialise la base de données avec les dumps SQL |
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

# Démarrer avec initialisation de la base de données
./run_local.sh --init-db

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

Importe les fichiers SQL suivants dans l'ordre :

| Fichier | Description |
|---------|-------------|
| `superset/dev-sql-import/01-rcq_prod_2026.sql` | Dump principal de la base |
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

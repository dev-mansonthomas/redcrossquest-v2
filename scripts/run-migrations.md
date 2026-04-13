# run-migrations.sh

## Description

Exécute les migrations SQL pour la base de données RedCrossQuest V2. Le script détecte les migrations déjà appliquées via une table `schema_migrations`, puis exécute uniquement les migrations en attente, dans l'ordre alphabétique.

## Prérequis

- **Bash** (version 4+)
- **Docker** (pour l'environnement `local`, avec le conteneur `rcq_mysql` en cours d'exécution)
- **MySQL client** (pour les environnements `dev`, `test`, `prod` — installable via `brew install mysql-client`)
- Les fichiers de migration SQL dans `superset/deploy-sql/`

## Usage

```bash
# Environnement local (Docker)
./scripts/run-migrations.sh local

# Environnements distants (GCP)
./scripts/run-migrations.sh <dev|test|prod> [utilisateur] [mot_de_passe]
```

## Arguments

| Argument | Requis | Description |
| --- | --- | --- |
| <env> | ✅ | Environnement cible : local, dev, test, prod |
| [utilisateur] | ❌ (défaut: root) | Utilisateur MySQL (env non-local uniquement) |
| [mot_de_passe] | ✅ (env non-local) | Mot de passe MySQL (env non-local uniquement) |

## Variables d'environnement

| Variable | Défaut | Description |
| --- | --- | --- |
| MIGRATION_DB_NAME | rcq_fr_dev_db | Nom de la base de données cible |
| MYSQL_ROOT_PASSWORD | rcq_root_password | Mot de passe root MySQL (env local) |
| DB_HOST | 127.0.0.1 | Hôte de la base de données (env non-local) |
| DB_PORT | 3306 | Port de la base de données (env non-local) |

## Exemples d'utilisation

```bash
# Migrations en local (Docker)
./scripts/run-migrations.sh local

# Migrations sur l'environnement dev via Cloud SQL Proxy
./scripts/run-migrations.sh dev root monMotDePasse

# Migrations en production
./scripts/run-migrations.sh prod admin monMotDePasseProd
```

## Fonctionnement

1. **Connexion** : Vérifie la connectivité MySQL
2. **Collecte** : Trouve tous les fichiers `*.sql` dans `superset/deploy-sql/` (triés par nom)
3. **Bootstrap** : Crée la table `schema_migrations` si elle n'existe pas (via `00-schema-migrations.sql`)
4. **Détection** : Récupère la liste des migrations déjà appliquées
5. **Exécution** : Applique les migrations en attente, une par une
6. **Enregistrement** : Enregistre chaque migration réussie avec son checksum MD5

## Fichiers utilisés

| Fichier | Description |
| --- | --- |
| superset/deploy-sql/*.sql | Fichiers de migration SQL |
| superset/deploy-sql/00-schema-migrations.sql | Script de création de la table schema_migrations |

## Table schema_migrations

La table `schema_migrations` contient l'historique des migrations appliquées :

- `filename` : Nom du fichier SQL
- `checksum` : Hash MD5 du fichier au moment de l'exécution

## Notes

- En environnement `local`, les commandes MySQL sont exécutées via `docker exec` dans le conteneur `rcq_mysql`.
- En environnement non-local, un fichier temporaire de configuration MySQL est créé pour éviter l'avertissement de mot de passe en ligne de commande. Ce fichier est automatiquement supprimé à la fin du script.
- Si une migration échoue, le script s'arrête immédiatement. Les migrations précédentes restent appliquées.
- Le script supporte `md5sum` (Linux) et `md5` (macOS) pour le calcul des checksums.
- Sur macOS, le script recherche le client MySQL dans les emplacements Homebrew (`/opt/homebrew/opt/mysql-client/bin/mysql` et `/usr/local/opt/mysql-client/bin/mysql`).
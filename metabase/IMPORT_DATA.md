# Importer les données de production

Le schéma RCQ n'est **pas créé automatiquement** par Docker. Vous devez importer votre propre dump de la base de production.

## Prérequis

- Docker et Docker Compose lancés
- Un dump SQL de la base de production (obtenu via Cloud SQL export ou `mysqldump`)

## Étapes

### 1. Lancer le container MySQL

```bash
cd metabase
docker compose up -d rcq_mysql
```

### 2. Copier votre dump dans le dossier sql-imports

```bash
cp /path/to/your/dump.sql metabase/sql-imports/
```

### 3. Importer le dump

```bash
docker exec -i rcq_mysql_dev mysql -u root -p"${MYSQL_ROOT_PASSWORD}" < metabase/sql-imports/dump.sql
```

> **Note** : Si votre dump ne contient pas de `CREATE DATABASE`, créez la base d'abord :
> ```bash
> docker exec rcq_mysql_dev mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "CREATE DATABASE IF NOT EXISTS rcq_fr_dev_db;"
> ```

### 4. Créer l'utilisateur read-only pour Metabase

```bash
./init-scripts/03-create-readonly-user.sh
```

Ce script interactif vous demandera les identifiants et créera un utilisateur avec des droits SELECT uniquement.

## Anonymisation

Si vous importez des données de production, pensez à les anonymiser :

```sql
-- Exemple d'anonymisation des données sensibles
UPDATE queteur SET
  first_name = CONCAT('Prenom_', id),
  last_name = CONCAT('Nom_', id),
  email = CONCAT('user_', id, '@example.com'),
  mobile = CONCAT('060000', LPAD(id, 4, '0'));
```

## Vérification

```bash
# Vérifier que les tables sont présentes
docker exec rcq_mysql_dev mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "USE rcq_fr_dev_db; SHOW TABLES;"
```

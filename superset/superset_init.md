# superset_init.sh

## Description

Script d'initialisation de Superset exécuté au démarrage du conteneur Docker. Il effectue les migrations de la base de données interne de Superset, crée ou met à jour l'utilisateur admin, et initialise les rôles et permissions. À la fin, il lance le serveur Superset.

## Prérequis

- Exécuté **à l'intérieur du conteneur Docker Superset**
- La commande `superset` doit être disponible dans le PATH
- Les variables d'environnement doivent être définies (via Docker Compose)

## Usage

Ce script est utilisé comme **entrypoint** du conteneur Superset dans `docker-compose.yml`. Il n'est pas destiné à être exécuté manuellement.

```dockerfile
# Dans le Dockerfile ou docker-compose.yml
CMD ["/app/superset_init.sh"]
```

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `SKIP_INIT` | *(non défini)* | Si `1`, ignore l'initialisation et lance directement Superset |
| `SUPERSET_ADMIN_USERNAME` | `admin` | Nom d'utilisateur admin |
| `SUPERSET_ADMIN_FIRST_NAME` | `Admin` | Prénom de l'admin |
| `SUPERSET_ADMIN_LAST_NAME` | `User` | Nom de l'admin |
| `SUPERSET_ADMIN_EMAIL` | `admin@rcq.local` | Email de l'admin |
| `SUPERSET_ADMIN_PASSWORD` | `admin` | Mot de passe de l'admin |

## Séquence d'initialisation

1. **Vérification `SKIP_INIT`** : Si `SKIP_INIT=1`, passe directement au lancement du serveur (utile pour les redémarrages rapides).

2. **Migrations BDD** (`superset db upgrade`) : Applique les migrations Alembic de la base de données interne de Superset (metadata).

3. **Création admin** (`superset fab create-admin`) : Crée l'utilisateur admin. Si l'utilisateur existe déjà, un message d'information est affiché.

4. **Reset mot de passe** : Assure que le mot de passe admin est à jour, même si l'utilisateur existait déjà. Utilise `superset fab reset-password` en priorité, avec un fallback Python utilisant directement le `security_manager` de Superset.

5. **Initialisation rôles** (`superset init`) : Initialise les rôles et permissions par défaut de Superset.

6. **Lancement serveur** : Exécute Superset sur `0.0.0.0:8088` avec threads et hot-reload activés.

## Commande de lancement

```bash
superset run -h 0.0.0.0 -p 8088 --with-threads --reload
```

Le serveur écoute sur le port **8088** et le hot-reload est activé pour le développement.

## Notes

- Le script utilise `exec` pour remplacer le processus shell par le processus Superset (le PID 1 du conteneur sera le serveur Superset).
- Le mécanisme de reset de mot de passe a un **triple fallback** : `fab reset-password` → script Python inline → message d'erreur non bloquant.
- `set -e` est activé : le script s'arrête à la première erreur, sauf pour les commandes qui gèrent explicitement les erreurs avec `||`.

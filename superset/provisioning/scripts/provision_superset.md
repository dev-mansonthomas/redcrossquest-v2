# provision_superset.py

## Description

Provisionne les dashboards Superset à partir de fichiers de configuration (JSON + SQL). Ce script crée ou met à jour les connexions base de données, datasets virtuels, graphiques et dashboards via l'API REST de Superset. Il gère également l'import de thèmes, l'activation de l'embedding et la mise à jour du fichier `.env` du backend.

## Prérequis

- **Python 3**
- **Dépendances Python** : `requests`, `python-dotenv`
- **Superset** en cours d'exécution et accessible
- Un fichier `.env.<env>` dans `superset/provisioning/`
- Des dossiers de configuration de dashboards dans `superset/provisioning/dashboards/`

## Usage

```bash
python3 superset/provisioning/scripts/provision_superset.py --env <environnement> [options]
```

## Options

| Option | Description |
|--------|-------------|
| `--env <env>` | **(requis)** Environnement : `dev`, `test`, `prod`, `local` |
| `--dashboard <nom>` | Provisionner un dashboard spécifique (défaut : tous) |
| `--force-update` | Mettre à jour les ressources existantes au lieu de les ignorer |
| `--auto-restart` | Redémarrer automatiquement le backend après provisioning |
| `--no-restart` | Ignorer la question de redémarrage du backend |
| `--skip-theme` | Ignorer l'import et l'application du thème `THEME_LIGHT` |

## Variables d'environnement

Chargées depuis `superset/provisioning/.env.<env>` :

| Variable | Description |
|----------|-------------|
| `SUPERSET_URL` | URL de l'instance Superset |
| `SUPERSET_ADMIN_USER` | Utilisateur admin Superset |
| `SUPERSET_ADMIN_PASSWORD` | Mot de passe admin Superset |
| `DB_CONNECTION_NAME` | Nom de la connexion base de données dans Superset |
| `DB_SQLALCHEMY_URI` | URI SQLAlchemy de la base de données RCQ |
| `EMBEDDING_ALLOWED_DOMAINS` | Domaines autorisés pour l'embedding (séparés par virgule) |
| `BACKEND_ENV_PATH` | Chemin vers le fichier `.env` du backend |

## Exemples d'utilisation

```bash
# Provisionner tous les dashboards en local
python3 superset/provisioning/scripts/provision_superset.py --env local

# Provisionner avec mise à jour forcée
python3 superset/provisioning/scripts/provision_superset.py --env dev --force-update

# Provisionner un dashboard spécifique
python3 superset/provisioning/scripts/provision_superset.py --env dev --dashboard yearly_goal

# Provisioning complet avec redémarrage auto du backend
python3 superset/provisioning/scripts/provision_superset.py --env local --force-update --auto-restart

# Sans thème ni redémarrage
python3 superset/provisioning/scripts/provision_superset.py --env dev --skip-theme --no-restart
```

## Structure des dossiers de dashboards

Chaque dashboard est défini dans un sous-dossier de `superset/provisioning/dashboards/` :

```
superset/provisioning/dashboards/
└── yearly_goal/
    ├── metadata.json     # Nom et métadonnées du dashboard
    ├── dataset.sql       # Requête SQL du dataset virtuel
    ├── chart.json        # Configuration du graphique
    └── dashboard.json    # Configuration du dashboard
```

## Fonctionnement

1. **Authentification** : Connexion via formulaire web (session cookie + CSRF token)
2. **Thème** : Import du thème `THEME_LIGHT` depuis `superset/provisioning/themes/superset_light_theme.zip`
3. **Connexion BDD** : Création ou détection de la connexion base de données
4. **Pour chaque dashboard** :
   - Création/mise à jour du dataset virtuel
   - Création/mise à jour du graphique
   - Création/mise à jour du dashboard avec layout
   - Association graphique ↔ dashboard
   - Activation de l'embedding
   - Application du thème
5. **Backend** : Mise à jour du fichier `.env` du backend avec les UUIDs d'embedding (`SUPERSET_DASHBOARD_<NOM>=<uuid>`)
6. **Redémarrage** : Redémarrage optionnel du backend via Docker Compose

## Fichiers générés/modifiés

| Fichier | Description |
|---------|-------------|
| `backend/.env` | Mise à jour des variables `SUPERSET_DASHBOARD_*` avec les UUIDs d'embedding |

## Mode upsert

- **Sans `--force-update`** : Les ressources existantes sont ignorées (skip)
- **Avec `--force-update`** : Les ressources existantes sont mises à jour (PUT)

## Notes

- L'authentification utilise le login par formulaire web (pas l'API JWT) pour obtenir un cookie de session valide.
- Le script vérifie que la session n'est pas anonyme après le login via `/api/v1/me/`.
- En cas de connexion BDD existante mais invisible via l'API, le script tente plusieurs méthodes de recherche avant d'échouer.
- Le redémarrage du backend est effectué via `docker compose -p rcq -f docker-compose.dev.yml up -d --force-recreate backend`.

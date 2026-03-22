# Superset Provisioning

Automated provisioning of Superset dashboards, datasets, charts, and themes via the Superset API.

## Usage

```bash
# Provision all dashboards for dev environment
python scripts/provision_superset.py --env dev

# Provision a specific dashboard
python scripts/provision_superset.py --env dev --dashboard yearly_goal

# Skip theme import entirely
python scripts/provision_superset.py --env dev --skip-theme

# Auto-restart backend after provisioning
python scripts/provision_superset.py --env dev --auto-restart
```

## Configuration

Copy `.env.example` to `.env.{env}` (e.g., `.env.dev`) and fill in the values.

## Prérequis

### Thème THEME_LIGHT

Le script importe automatiquement le thème `THEME_LIGHT` dans Superset à partir du fichier ZIP `themes/superset_light_theme.zip` via l'API d'import (`/api/v1/css_template/import/`).

Le thème est ensuite appliqué automatiquement à chaque dashboard lors du provisioning.

Pour mettre à jour le thème :
1. Aller dans Superset → **Settings** → **CSS Templates**
2. Modifier le thème souhaité
3. Exporter via le bouton **Export**
4. Remplacer le fichier `themes/superset_light_theme.zip` par l'export

## Structure

```
superset/provisioning/
├── .env.example              # Template de configuration
├── .env.dev                  # Config dev (non versionné)
├── README.md                 # Ce fichier
├── themes/
│   └── superset_light_theme.zip  # Thème ZIP importé via API
├── dashboards/
│   └── yearly_goal/
│       ├── metadata.json     # Nom, titre, slug
│       ├── dataset.sql       # Requête SQL du dataset
│       ├── chart.json        # Configuration du chart
│       └── dashboard.json    # Configuration du dashboard
└── scripts/
    ├── __init__.py
    └── provision_superset.py # Script principal
```

## Ajouter un nouveau dashboard

1. Créer un dossier dans `dashboards/` (ex: `dashboards/mon_dashboard/`)
2. Ajouter les fichiers `metadata.json`, `dataset.sql`, `chart.json`, `dashboard.json`
3. Lancer le provisioning : `python scripts/provision_superset.py --env dev`


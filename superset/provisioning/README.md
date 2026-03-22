# Superset Provisioning

Automated provisioning of Superset dashboards, datasets, charts, and themes via the Superset API.

## Usage

```bash
# Provision all dashboards for dev environment
python scripts/provision_superset.py --env dev

# Provision a specific dashboard
python scripts/provision_superset.py --env dev --dashboard yearly_goal

# Force provisioning even if THEME_LIGHT is missing
python scripts/provision_superset.py --env dev --force

# Skip theme creation entirely
python scripts/provision_superset.py --env dev --skip-theme

# Auto-restart backend after provisioning
python scripts/provision_superset.py --env dev --auto-restart
```

## Configuration

Copy `.env.example` to `.env.{env}` (e.g., `.env.dev`) and fill in the values.

## Prérequis

### Thème THEME_LIGHT

Le script crée automatiquement le CSS template `THEME_LIGHT` dans Superset à partir du fichier `themes/theme_light.css`.

Si la création automatique échoue, créer le thème manuellement (une seule fois par environnement) :

1. Aller dans Superset → **Settings** → **CSS Templates**
2. Exporter `theme_default` (bouton Export)
3. Dézipper l'archive exportée
4. Renommer le template en `THEME_LIGHT` dans le fichier JSON
5. Rezipper et importer via **Settings** → **CSS Templates** → **Import**
6. Vérifier que `THEME_LIGHT` apparaît dans la liste des templates

Le thème est ensuite appliqué automatiquement à chaque dashboard lors du provisioning.

## Structure

```
superset/provisioning/
├── .env.example              # Template de configuration
├── .env.dev                  # Config dev (non versionné)
├── README.md                 # Ce fichier
├── themes/
│   └── theme_light.css       # CSS partagé pour THEME_LIGHT
├── dashboards/
│   └── yearly_goal/
│       ├── metadata.json     # Nom, titre, slug
│       ├── dataset.sql       # Requête SQL du dataset
│       ├── chart.json        # Configuration du chart
│       ├── dashboard.json    # Configuration du dashboard
│       └── theme.css         # CSS spécifique (optionnel)
└── scripts/
    ├── __init__.py
    └── provision_superset.py # Script principal
```

## Ajouter un nouveau dashboard

1. Créer un dossier dans `dashboards/` (ex: `dashboards/mon_dashboard/`)
2. Ajouter les fichiers `metadata.json`, `dataset.sql`, `chart.json`, `dashboard.json`
3. Optionnellement ajouter un `theme.css` spécifique
4. Lancer le provisioning : `python scripts/provision_superset.py --env dev`


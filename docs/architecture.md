# Architecture RCQ V2 — Dashboards

## Stack technique
- **Frontend** : Angular 19 (standalone components, signals)
- **Backend** : FastAPI (Python 3.13)
- **Base de données** : MySQL 8
- **BI** : Apache Superset (embedded dashboards)
- **Cache** : Valkey (compatible Redis)
- **Cartes** : Leaflet.js
- **Infra locale** : Docker Compose

## Architecture des dashboards

```
┌─────────────────────────────────────────────────┐
│                   Frontend (Angular)            │
│  ┌───────────────────┐  ┌────────────────────┐  │
│  │ Superset Embedded │  │ Natif Angular      │  │
│  │ - Objectifs       │  │ - Cartes Leaflet   │  │
│  │   Annuels (5.4)   │  │ - Sacs de Banque   │  │
│  │                   │  │ - Leaderboard      │  │
│  └────────┬──────────┘  └────────┬───────────┘  │
│           │                      │              │
│           ▼                      ▼              │
│  ┌───────────────┐      ┌───────────────┐       │
│  │ Guest Token   │      │ REST API      │       │
│  │ /api/superset │      │ /api/*        │       │
│  └───────┬───────┘      └───────┬───────┘       │
└──────────┼──────────────────────┼───────────────┘
           │                      │
           ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│ Superset (8088) │    │ Backend (8010)  │
│ - Datasets SQL  │    │ - FastAPI       │
│ - Charts        │    │ - SQLAlchemy    │
│ - Dashboards    │    │ - Auth Google   │
└────────┬────────┘    └────────┬────────┘
         │                      │
         └──────────┬───────────┘
                    ▼
           ┌───────────────┐
           │  MySQL (3306) │
           │  rcq_fr_dev   │
           └───────────────┘
```

## Authentification
- Login via Google OAuth2
- Session JWT stockée en cookie
- Super Admin (role=9) peut switch d'UL via header `X-Override-UL-Id`
- L'override est stocké en `sessionStorage` (persiste au refresh, disparaît à la déconnexion)

## Sidebar & Navigation
- Layout : sidebar gauche fixe + contenu central
- Les dashboards Superset sont chargés en iframe embedded
- Les composants natifs Angular utilisent l'API REST directement
- Hauteur de header unifiée (`h-14`) entre sidebar et contenu

## Provisioning Superset
- Scripts dans `superset/provisioning/`
- Commande : `./run_local.sh --provision --force-update`
- Le script crée les datasets, charts, dashboards et active l'embedding
- Les UUIDs des dashboards sont écrits dans `backend/.env`

## Accès par rôle
| Rôle | ID | Accès |
|------|----|-------|
| Quêteur | 1 | Objectifs Annuels |
| Chef d'équipe | 2 | Objectifs Annuels |
| Compteur/Trésorier | 3 | Objectifs Annuels, Sacs de Banque |
| Admin UL | 4 | Tout |
| Super Admin | 9 | Tout + switch UL |

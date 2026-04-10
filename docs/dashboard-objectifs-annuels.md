# Dashboard : Objectifs Annuels (5.4)

## Description
Dashboard Superset embedded affichant l'objectif vs le réalisé pour l'année courante.
Courbe cumulative du montant collecté par jour de quête, comparée à l'objectif.

## Type : Superset Embedded
- Provisionné via `superset/provisioning/`
- UUID stocké dans `SUPERSET_DASHBOARD_YEARLY_GOAL` (backend/.env)
- Accès via Guest Token (Row Level Security sur `ul_id`)

## Accès
- Rôles : tous (1, 2, 3, 4, 9)
- Route : `/dashboards/kpi`

## Dataset SQL
Voir `superset/provisioning/dashboards/yearly_goal/dataset.sql`

Utilise :
- `v_tronc_queteur_enriched` — données de collecte
- `quete_dates` — dates de début de quête par année
- `yearly_goal` — objectif annuel par UL

## Provisioning
```bash
./run_local.sh --provision --force-update
# ou directement :
cd superset/provisioning && python3 scripts/provision_superset.py --env local --force-update
```

## Réactivité
- UL Override → re-embed le dashboard (re-fetch Guest Token)

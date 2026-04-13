# Objets SQL — RCQ V2

## Vue : v_tronc_queteur_enriched

### Description
Vue MySQL qui pré-calcule les colonnes dérivées de `tronc_queteur` pour éviter de dupliquer les formules dans chaque query.

### Source
`superset/deploy-sql/03-create-view-tronc-queteur-enriched.sql`

### Filtres
- `tq.deleted = 0`
- `tq.comptage IS NOT NULL` (seuls les troncs comptés)

### Colonnes héritées de tronc_queteur
id, ul_id, queteur_id, point_quete_id, tronc_id, depart_theorique, depart, retour, comptage,
coins_money_bag_id, bills_money_bag_id, euro500, euro200, euro100, euro50, euro20, euro10, euro5,
euro2, euro1, cents50, cents20, cents10, cents5, cents2, cent1, don_cheque, don_creditcard, deleted

### Colonnes calculées

| Colonne | Type | Unité | Description |
|---------|------|-------|-------------|
| `dons_cb_total` | DECIMAL | € | Total CB détaillé depuis la table `credit_card` |
| `total_amount` | DECIMAL | € | Somme pièces + billets + chèques + CB |
| `weight` | DECIMAL | grammes | Poids physique (pièces + billets) |
| `duration_minutes` | INT | minutes | TIMESTAMPDIFF(MINUTE, depart, retour) |
| `quete_day_num` | INT | jour | DATEDIFF(DATE(depart), qd.start_date) + 1 — jour de quête (1 = premier jour). Peut être < 1 ou > nb_days pour les troncs hors période. |

### Formule total_amount
> Note: `don_creditcard` est un cache de la table `credit_card`, ne pas additionner les deux.

```sql
COALESCE(tq.euro500, 0) * 500 +
COALESCE(tq.euro200, 0) * 200 +
COALESCE(tq.euro100, 0) * 100 +
COALESCE(tq.euro50, 0) * 50 +
COALESCE(tq.euro20, 0) * 20 +
COALESCE(tq.euro10, 0) * 10 +
COALESCE(tq.euro5, 0) * 5 +
COALESCE(tq.euro2, 0) * 2 +
COALESCE(tq.euro1, 0) * 1 +
COALESCE(tq.cents50, 0) * 0.5 +
COALESCE(tq.cents20, 0) * 0.2 +
COALESCE(tq.cents10, 0) * 0.1 +
COALESCE(tq.cents5, 0) * 0.05 +
COALESCE(tq.cents2, 0) * 0.02 +
COALESCE(tq.cent1, 0) * 0.01 +
COALESCE(tq.don_cheque, 0) +
COALESCE(tq.don_creditcard, 0)
```

### Formule weight (poids par pièce/billet en grammes)
| Type | Poids unitaire (g) |
|------|-------------------|
| 500€ | 1.1 |
| 200€ | 1.1 |
| 100€ | 1.0 |
| 50€  | 0.9 |
| 20€  | 0.8 |
| 10€  | 0.7 |
| 5€   | 0.6 |
| 2€   | 8.5 |
| 1€   | 7.5 |
| 50c  | 7.8 |
| 20c  | 5.74 |
| 10c  | 4.1 |
| 5c   | 3.92 |
| 2c   | 3.06 |
| 1c   | 2.3 |

### Jointure credit_card
LEFT JOIN sur `credit_card` agrégée par `tronc_queteur_id` : `SUM(quantity * amount)`

### Jointure quete_dates
LEFT JOIN sur `quete_dates` par `YEAR(tq.depart)` pour calculer `quete_day_num`

---

## Table : quete_dates

### Description
Table de référence stockant la date de début et la durée de la quête pour chaque année.
Remplace les valeurs PHP hardcodées de RCQ v1.

### Source
`superset/deploy-sql/01-quete-dates.sql`

### Schema
| Colonne | Type | Description |
|---------|------|-------------|
| id | INT PK | Auto-increment |
| year | INT UNIQUE | Année de la quête |
| start_date | DATE | Date de début |
| nb_days | INT | Nombre total de jours de quête |

### Données
2004-2026 (seed data dans le fichier SQL)

### Utilisation
- Dashboard Superset "Objectif vs Réalisé" : génère les dates de quête pour la courbe cumulative
- Endpoint `/api/map/available-years` : liste les années avec des données

# 5.2 Leaderboard Collecteurs

## Description
Classement des collecteurs (quêteurs) pour une année donnée, avec drill-down sur les troncs individuels.

## Accès
- Rôles : 4 (Admin UL), 9 (Super Admin)

## Interface

### Header
- Titre : "🏆 Leaderboard Collecteurs"
- Sélecteur d'année (par défaut : année courante)
- Bouton refresh 🔄

### Tableau principal — Classement
Colonnes :
| Rang | Nom | Prénom | Total € | Heures | Nb sorties | Poids (kg) | Efficacité (€/h) |
|------|-----|--------|---------|--------|------------|------------|-------------------|

- Tri par défaut : Total € desc
- Colonnes triables en cliquant sur l'en-tête (Total €, Heures, Nb sorties, Poids, Efficacité)
- Le rang se recalcule selon la colonne de tri active

### Drill-down — Troncs d'un collecteur
Au clic sur une ligne du classement, afficher en dessous (expand) la liste des tronc_queteur du collecteur :

| ID TQ | Total € | Temps de quête | Poids (kg) | Point de quête |
|-------|---------|----------------|------------|----------------|

Lien vers RCQ v1 au clic sur un tronc (ouvre dans une nouvelle fenêtre).

## Données

### Classement (agrégé par quêteur)
```sql
SELECT
  q.id AS queteur_id,
  q.first_name,
  q.last_name,
  ROUND(SUM(tqe.total_amount), 2) AS total_euro,
  ROUND(SUM(tqe.time_spent_in_hours), 2) AS total_hours,
  COUNT(*) AS nb_sorties,
  ROUND(SUM(tqe.weight) / 1000, 2) AS total_weight_kg,
  ROUND(SUM(tqe.total_amount) / NULLIF(SUM(tqe.time_spent_in_hours), 0), 2) AS efficiency_euro_per_hour
FROM v_tronc_queteur_enriched tqe
JOIN queteur q ON tqe.queteur_id = q.id
WHERE tqe.ul_id = :ul_id AND YEAR(tqe.depart) = :year
GROUP BY q.id, q.first_name, q.last_name
ORDER BY total_euro DESC
```

### Drill-down (troncs d'un quêteur)
```sql
SELECT
  tqe.id AS tronc_queteur_id,
  ROUND(tqe.total_amount, 2) AS total_euro,
  ROUND(tqe.time_spent_in_hours, 2) AS hours,
  ROUND(tqe.weight / 1000, 2) AS weight_kg,
  pq.name AS point_quete_name
FROM v_tronc_queteur_enriched tqe
JOIN point_quete pq ON tqe.point_quete_id = pq.id
WHERE tqe.queteur_id = :queteur_id
  AND tqe.ul_id = :ul_id
  AND YEAR(tqe.depart) = :year
ORDER BY tqe.depart DESC
```

## Calculs
- **Heures** : champ `time_spent_in_hours` de `v_tronc_queteur_enriched`
- **Poids** : champ `weight` de `v_tronc_queteur_enriched` (en grammes, affiché en kg)
- **Efficacité** : total_euro / total_hours (€/h)

## Réactivité
- Changement d'année → recharge le classement, ferme le drill-down
- UL Override (Super Admin) → recharge via effect()

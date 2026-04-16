# Dashboards : Cartes Leaflet (5.8)

## Description

2 cartes Leaflet natives Angular pour visualiser les points de quête et les quêteurs.

## Accès

- Rôles : tous (1, 2, 3, 4, 9)

### Carte des quêteurs actifs

- Route : `/dashboards/carte-queteurs`
- Affiche les quêteurs actuellement en collecte (départ non null, retour null)
- Icônes par type de point de quête (🚦🚶🏪🏠📌)
- Tooltip au hover avec nom du quêteur et code du point de quête

### API

- `GET /api/map/active-queteurs` — Quêteurs actifs
- `GET /api/map/points-quete` — Points de quête

### Carte analytique des points de quête

- Route : `/dashboards/carte-stats`
- Cercles proportionnels avec dégradé de couleur
- 4 vues : Total € | €/h | Troncs | Heures
- Filtre par années (chips)
- Badge quêteurs actifs sur chaque point

### API

- `GET /api/map/available-years` — Années avec données
- `GET /api/map/points-quete-stats?years=2024,2025` — Stats agrégées

## Réactivité

- UL Override → recharge les données via effect()
- Bouton refresh 🔄 dans le header
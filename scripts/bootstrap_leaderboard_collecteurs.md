# bootstrap_leaderboard_collecteurs.py

## Description

Crée un dashboard Superset "Leaderboard Collecteurs" complet via l'API REST de Superset. Ce script bootstrap un dataset virtuel (requête SQL), trois graphiques et un dashboard avec embedding activé. Il est conçu pour une utilisation en développement local.

## Prérequis

- **Python 3** (aucune dépendance externe requise — utilise uniquement `urllib`)
- **Superset** en cours d'exécution sur `http://localhost:8088`
- Un utilisateur admin Superset (`admin` / `admin`)
- Une base de données déjà configurée dans Superset (ID = 1)
- Les tables `queteur` et `tronc_queteur` existantes dans la base de données

## Usage

```bash
python3 scripts/bootstrap_leaderboard_collecteurs.py
```

Le script n'accepte aucun argument ni option.

## Constantes configurées dans le code

| Constante | Valeur | Description |
|-----------|--------|-------------|
| `SUPERSET_URL` | `http://localhost:8088` | URL de l'instance Superset |
| `USERNAME` | `admin` | Utilisateur Superset |
| `PASSWORD` | `admin` | Mot de passe Superset |
| `DATABASE_ID` | `1` | ID de la connexion base de données dans Superset |

## Ressources créées

### 1. Dataset virtuel : `leaderboard_collecteurs`
Requête SQL qui agrège les données de collecte par quêteur pour l'année en cours :
- Nom du quêteur (prénom + initiale du nom)
- Nombre de troncs comptés
- Total collecté (espèces + CB + chèques)
- Moyenne par tronc
- Rang au sein de l'unité locale (UL)

### 2. Graphique table : "Top 20 Collecteurs"
Tableau des 20 meilleurs collecteurs avec colonnes : rang, nom, nombre de troncs, total collecté, moyenne.

### 3. Graphique barres : "Top 10 Collecteurs"
Graphique en barres horizontales montrant les 10 meilleurs collecteurs par montant collecté.

### 4. Graphique "Big Number" : "Nombre de Participants"
Affiche le nombre total de quêteurs actifs pour l'année en cours.

### 5. Dashboard : "Leaderboard Collecteurs"
Dashboard avec deux lignes :
- **Ligne 1** : "Nombre de Participants" (largeur 3/12) + "Top 10 Collecteurs" (largeur 9/12)
- **Ligne 2** : "Top 20 Collecteurs" (largeur 12/12)

L'embedding est automatiquement activé pour le dashboard.

## Sortie

Le script affiche :
- La progression de la création de chaque ressource
- L'ID et l'UUID du dashboard créé
- L'URL d'accès au dashboard

```
============================================================
  ✅ Dashboard ready!
     ID   : 1
     UUID : abc12345-...
     URL  : http://localhost:8088/superset/dashboard/1/
============================================================
```

## Notes

- Ce script est conçu pour le **développement local uniquement** (credentials en dur).
- Si les ressources existent déjà, le script échouera (pas de mode upsert).
- Le dataset ne filtre que les troncs dont le comptage (`comptage`) est non-null, non-supprimés (`deleted = 0`), et de l'année en cours.
- Le schéma utilisé est `rcq_fr_dev_db`.

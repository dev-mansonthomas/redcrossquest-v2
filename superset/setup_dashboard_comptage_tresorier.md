# setup_dashboard_comptage_tresorier.sh

## Description

Crée un dashboard Superset "Comptage Trésorier" complet via l'API REST de Superset. Ce script crée un dataset virtuel, trois graphiques (tableau, big number, camembert) et un dashboard avec filtres natifs et embedding activé.

## Prérequis

- **Bash**
- **curl**
- **python3** (pour le parsing JSON et la génération du layout)
- **Superset** en cours d'exécution

## Usage

```bash
./superset/setup_dashboard_comptage_tresorier.sh
```

Le script n'accepte aucun argument.

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `SUPERSET_URL` | `http://localhost:8088` | URL de l'instance Superset |
| `SUPERSET_USER` | `admin` | Utilisateur admin Superset |
| `SUPERSET_PASS` | `admin` | Mot de passe admin Superset |

## Exemples d'utilisation

```bash
# Utilisation par défaut (localhost)
./superset/setup_dashboard_comptage_tresorier.sh

# Avec une instance Superset distante
SUPERSET_URL=https://superset.example.com \
SUPERSET_USER=admin \
SUPERSET_PASS=monMotDePasse \
./superset/setup_dashboard_comptage_tresorier.sh
```

## Ressources créées

### 1. Dataset virtuel : `comptage_tresorier`
Requête SQL joignant `tronc_queteur`, `queteur` et `point_quete` avec :
- Date et heure du comptage et du retour
- Nom du quêteur et point de quête
- Statut (Compté / Non compté)
- Détail : total billets, total pièces, total chèques, total CB
- Montant total (toutes sources)
- IDs des sacs de monnaie (`coins_money_bag_id`, `bills_money_bag_id`)
- Filtre : troncs non supprimés avec retour renseigné

### 2. Graphique tableau : "Comptage - Liste des Troncs"
Tableau paginé (25 lignes/page, max 100) avec recherche intégrée. Colonnes : date, quêteur, point de quête, statut, billets, pièces, chèques, CB, montant total, sacs de monnaie.

### 3. Graphique "Big Number" : "Comptage - Total du Jour"
Affiche la somme du montant total pour la journée en cours (filtre `date_comptage = CURDATE()`).

### 4. Graphique camembert : "Comptage - Répartition par Quêteur"
Top 10 des quêteurs par montant total collecté, avec pourcentages.

### 5. Dashboard : "Comptage Trésorier"
Layout en deux lignes :
- **Ligne 1** : Total du Jour (largeur 4/12) + Répartition par Quêteur (largeur 8/12)
- **Ligne 2** : Liste des Troncs (largeur 12/12)

Inclut un filtre natif "Date de comptage" (type temps, valeur par défaut : dernière semaine).

## Fichiers temporaires

| Fichier | Description |
|---------|-------------|
| `/tmp/rcq_dash_payload.json` | Payload JSON pour le layout du dashboard (supprimé après utilisation) |

## Sortie

```
════════════════════════════════════════════
✅ Dashboard 'Comptage Trésorier' created!
   URL:  http://localhost:8088/superset/dashboard/1/
   UUID: abc12345-...
   Dataset ID: 1
   Charts: Table=1, BigNumber=2, Pie=3
════════════════════════════════════════════
```

## Notes

- Le script utilise la base de données Superset ID = 1 et le schéma `rcq_fr_dev_db`.
- L'embedding est activé sans restriction de domaine (`allowed_domains: []`).
- Si les ressources existent déjà, le script échouera (pas de mode upsert).
- L'authentification se fait via l'API JWT de Superset avec un token CSRF.

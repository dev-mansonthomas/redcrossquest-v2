# Dashboard : Sacs de Banque

## Description
Page Angular native permettant de consulter les sacs de banque (pièces et billets) par année.
Fonctionnalité optionnelle — tous les UL n'utilisent pas les sacs de banque.

## Accès
- Rôles : 3 (Compteur/Trésorier), 4 (Admin UL), 9 (Super Admin)
- Route : `/dashboards/sacs-banque`

## Use case
Les unités locales remettent l'argent dans des sacs de banque. Les sacs ne doivent pas dépasser un certain poids.
Un sac contient soit des pièces, soit des billets (jamais les deux).
Chaque tronc_queteur a 2 colonnes : `coins_money_bag_id` et `bills_money_bag_id`.
Un même ID de sac peut être utilisé par plusieurs troncs (somme agrégée).

## Interface

### Header
- Titre : "💰 Sacs de Banque"
- Toggle : 🪙 Pièces / 💵 Billets
- Sélecteur d'année (défaut : année courante)
- Bouton refresh 🔄

### Row 1 — Détail (2 colonnes)
Affiché quand un sac est sélectionné, sinon "Sélectionnez un sac" en placeholder.

**Colonne gauche** : Tableau détail du sac
- Poids total
- Tableau : Type | Nombre | Total €

**Colonne droite** : Liste des tronc_queteur du sac
- Colonnes : ID TQ | Nom | Prénom | Point de quête | ID Tronc
- Clic → ouvre RCQ v1 dans un nouvel onglet

### Row 2 — Liste des sacs
- Cards à largeur fixe
- Ligne 1 : ID du sac (max 20 chars)
- Ligne 2 : Poids | Total € | Nb troncs
- Sac sélectionné : border bleue
- Poids > 30kg : texte rouge ⚠️

## API Endpoints
- `GET /api/money-bags?year=2026` — Liste des sacs
- `GET /api/money-bags/{bag_id}/detail?type=coins&year=2026` — Détail d'un sac
- `GET /api/money-bags/{bag_id}/troncs?type=coins&year=2026` — Troncs d'un sac
- `GET /api/config/rcq-urls` — URLs RCQ v1

## Réactivité
- UL Override (Super Admin) → recharge via effect()
- Changement d'année → recharge tout
- Toggle pièces/billets → recharge la liste, efface le détail

-- Migration: Create view v_tronc_queteur_enriched
-- Description: Vue MySQL réutilisable qui pré-calcule les colonnes dérivées de tronc_queteur
--   (montant total, poids, durée, CB total) pour éviter de dupliquer les CTEs dans chaque dataset Superset.
-- Compatible: MySQL 8 (pas de CTE dans les vues, utilise des sous-requêtes)

DROP VIEW IF EXISTS v_tronc_queteur_enriched;

CREATE VIEW v_tronc_queteur_enriched AS
SELECT
    -- Colonnes brutes de tronc_queteur
    tq.id,
    tq.ul_id,
    tq.queteur_id,
    tq.point_quete_id,
    tq.tronc_id,
    tq.depart_theorique,
    tq.depart,
    tq.retour,
    tq.comptage,
    tq.coins_money_bag_id,
    tq.bills_money_bag_id,
    tq.euro500,
    tq.euro200,
    tq.euro100,
    tq.euro50,
    tq.euro20,
    tq.euro10,
    tq.euro5,
    tq.euro2,
    tq.euro1,
    tq.cents50,
    tq.cents20,
    tq.cents10,
    tq.cents5,
    tq.cents2,
    tq.cent1,
    tq.don_cheque,
    tq.don_creditcard,
    tq.deleted,

    -- Colonnes calculées

    -- dons_cb_total : total CB détaillé depuis la table credit_card
    COALESCE(cc.cc_total, 0) AS dons_cb_total,

    -- total_amount : somme de toutes les pièces/billets + chèques + CB (don_creditcard)
    -- Note: don_creditcard est un cache de la table credit_card, ne pas additionner les deux
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
    COALESCE(tq.don_creditcard, 0) AS total_amount,

    -- weight : poids physique des pièces/billets en grammes
    COALESCE(tq.euro500, 0) * 1.1 +
    COALESCE(tq.euro200, 0) * 1.1 +
    COALESCE(tq.euro100, 0) * 1 +
    COALESCE(tq.euro50, 0) * 0.9 +
    COALESCE(tq.euro20, 0) * 0.8 +
    COALESCE(tq.euro10, 0) * 0.7 +
    COALESCE(tq.euro5, 0) * 0.6 +
    COALESCE(tq.euro2, 0) * 8.5 +
    COALESCE(tq.euro1, 0) * 7.5 +
    COALESCE(tq.cents50, 0) * 7.8 +
    COALESCE(tq.cents20, 0) * 5.74 +
    COALESCE(tq.cents10, 0) * 4.1 +
    COALESCE(tq.cents5, 0) * 3.92 +
    COALESCE(tq.cents2, 0) * 3.06 +
    COALESCE(tq.cent1, 0) * 2.3 AS weight,

    -- duration_minutes : durée de quête en minutes
    TIMESTAMPDIFF(MINUTE, tq.depart, tq.retour) AS duration_minutes

FROM tronc_queteur tq
LEFT JOIN (
    SELECT tronc_queteur_id, SUM(quantity * amount) AS cc_total
    FROM credit_card
    GROUP BY tronc_queteur_id
) cc ON cc.tronc_queteur_id = tq.id
WHERE tq.deleted = 0
  AND tq.comptage IS NOT NULL;

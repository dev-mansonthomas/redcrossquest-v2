-- Dashboard: Objectif vs Réalisé
-- Description: Affiche sur un même graphique le montant cumulé des objectifs (yearly_goal)
--   et le montant cumulé des collectes réelles (tronc_queteur + credit_card + daily_stats_before_rcq)
--   par jour de quête, pour les 5 dernières années.
-- Usage: Créer un Virtual Dataset dans Superset avec cette requête

WITH
-- ─── CTE 1: Credit card totals per tronc_queteur ────────────────────────────
cc_total AS (
    SELECT tronc_queteur_id,
           SUM(quantity * amount) AS cc_total_per_tq
    FROM credit_card
    GROUP BY tronc_queteur_id
),

-- ─── CTE 2: Amount per tronc (coins + bills + cheques + CB) ─────────────────
tq_amount AS (
    SELECT tq.id,
           tq.ul_id,
           tq.depart,
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
           COALESCE(tq.don_creditcard, 0) +
           COALESCE(cct.cc_total_per_tq, 0) AS total_tq
    FROM tronc_queteur tq
    LEFT JOIN cc_total cct ON cct.tronc_queteur_id = tq.id
    WHERE tq.deleted = 0
      AND tq.comptage IS NOT NULL
),

-- ─── CTE 3: Réalisé daily amounts (tronc_queteur + daily_stats_before_rcq) ──
realise_daily AS (
    -- From tronc_queteur
    SELECT tqa.ul_id,
           YEAR(tqa.depart) AS year,
           DATEDIFF(DATE(tqa.depart), qd.start_date) + 1 AS jour_num,
           SUM(tqa.total_tq) AS montant_jour
    FROM tq_amount tqa
    JOIN quete_dates qd ON qd.year = YEAR(tqa.depart)
    WHERE DATEDIFF(DATE(tqa.depart), qd.start_date) + 1 BETWEEN 1 AND 9
      AND YEAR(tqa.depart) >= YEAR(NOW()) - 5
    GROUP BY tqa.ul_id, YEAR(tqa.depart), jour_num

    UNION ALL

    -- From daily_stats_before_rcq (pre-RCQ data)
    SELECT dsb.ul_id,
           YEAR(dsb.date) AS year,
           DATEDIFF(dsb.date, qd.start_date) + 1 AS jour_num,
           dsb.amount AS montant_jour
    FROM daily_stats_before_rcq dsb
    JOIN quete_dates qd ON qd.year = YEAR(dsb.date)
    WHERE DATEDIFF(dsb.date, qd.start_date) + 1 BETWEEN 1 AND 9
      AND YEAR(dsb.date) >= YEAR(NOW()) - 5
),

-- ─── CTE 4: Réalisé cumulated ───────────────────────────────────────────────
realise_cumule AS (
    SELECT ul_id,
           year,
           jour_num,
           CONCAT('Réalisé ', year) AS serie,
           ROUND(SUM(SUM(montant_jour)) OVER (
               PARTITION BY ul_id, year ORDER BY jour_num
           ), 2) AS montant_cumule
    FROM realise_daily
    GROUP BY ul_id, year, jour_num
),

-- ─── CTE 5: Objectif unfolded over 9 days with cumulative percentages ───────
objectif_cumule AS (
    SELECT ul_id, year, 1 AS jour_num, CONCAT('Objectif ', year) AS serie,
           ROUND(amount * day_1_percentage / 100, 2) AS montant_cumule
    FROM yearly_goal WHERE year >= YEAR(NOW()) - 5
    UNION ALL
    SELECT ul_id, year, 2, CONCAT('Objectif ', year),
           ROUND(amount * (day_1_percentage + day_2_percentage) / 100, 2)
    FROM yearly_goal WHERE year >= YEAR(NOW()) - 5
    UNION ALL
    SELECT ul_id, year, 3, CONCAT('Objectif ', year),
           ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage) / 100, 2)
    FROM yearly_goal WHERE year >= YEAR(NOW()) - 5
    UNION ALL
    SELECT ul_id, year, 4, CONCAT('Objectif ', year),
           ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage) / 100, 2)
    FROM yearly_goal WHERE year >= YEAR(NOW()) - 5
    UNION ALL
    SELECT ul_id, year, 5, CONCAT('Objectif ', year),
           ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage + day_5_percentage) / 100, 2)
    FROM yearly_goal WHERE year >= YEAR(NOW()) - 5
    UNION ALL
    SELECT ul_id, year, 6, CONCAT('Objectif ', year),
           ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage + day_5_percentage + day_6_percentage) / 100, 2)
    FROM yearly_goal WHERE year >= YEAR(NOW()) - 5
    UNION ALL
    SELECT ul_id, year, 7, CONCAT('Objectif ', year),
           ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage + day_5_percentage + day_6_percentage + day_7_percentage) / 100, 2)
    FROM yearly_goal WHERE year >= YEAR(NOW()) - 5
    UNION ALL
    SELECT ul_id, year, 8, CONCAT('Objectif ', year),
           ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage + day_5_percentage + day_6_percentage + day_7_percentage + day_8_percentage) / 100, 2)
    FROM yearly_goal WHERE year >= YEAR(NOW()) - 5
    UNION ALL
    SELECT ul_id, year, 9, CONCAT('Objectif ', year),
           ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage + day_5_percentage + day_6_percentage + day_7_percentage + day_8_percentage + day_9_percentage) / 100, 2)
    FROM yearly_goal WHERE year >= YEAR(NOW()) - 5
)

-- ─── Final: Union of both series ─────────────────────────────────────────────
SELECT ul_id, year, jour_num, serie, montant_cumule
FROM realise_cumule

UNION ALL

SELECT ul_id, year, jour_num, serie, montant_cumule
FROM objectif_cumule

ORDER BY ul_id, year, serie, jour_num


-- Dashboard: Objectif vs Réalisé
-- Description: Affiche sur un même graphique le montant cumulé des objectifs (yearly_goal)
--   et le montant cumulé des collectes réelles (tronc_queteur + credit_card + daily_stats_before_rcq)
--   par jour de quête, pour les 5 dernières années.
-- Usage: Créer un Virtual Dataset dans Superset avec cette requête

WITH
-- ─── CTE 1: Réalisé daily amounts (v_tronc_queteur_enriched + daily_stats_before_rcq) ──
realise_daily AS (
    -- From v_tronc_queteur_enriched (replaces cc_total + tq_amount CTEs)
    SELECT tqe.ul_id,
           YEAR(tqe.depart) AS year,
           DATEDIFF(DATE(tqe.depart), qd.start_date) + 1 AS jour_num,
           SUM(tqe.total_amount) AS montant_jour
    FROM v_tronc_queteur_enriched tqe
    JOIN quete_dates qd ON qd.year = YEAR(tqe.depart)
    WHERE DATEDIFF(DATE(tqe.depart), qd.start_date) + 1 BETWEEN 1 AND 9
      AND YEAR(tqe.depart) >= YEAR(NOW()) - 5
    GROUP BY tqe.ul_id, YEAR(tqe.depart), jour_num

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

-- ─── CTE 2: Réalisé cumulated ───────────────────────────────────────────────
realise_cumule AS (
    SELECT ul_id,
           year,
           jour_num,
           'Réalisé' AS serie,
           ROUND(SUM(SUM(montant_jour)) OVER (
               PARTITION BY ul_id, year ORDER BY jour_num
           ), 2) AS montant_cumule
    FROM realise_daily
    GROUP BY ul_id, year, jour_num
),

-- ─── CTE 3: Objectif unfolded over 9 days with cumulative percentages ───────
objectif_cumule AS (
    SELECT ul_id, year, 1 AS jour_num, 'Objectif' AS serie,
           ROUND(amount * day_1_percentage / 100, 2) AS montant_cumule
    FROM yearly_goal WHERE year = YEAR(NOW())
    UNION ALL
    SELECT ul_id, year, 2, 'Objectif',
           ROUND(amount * (day_1_percentage + day_2_percentage) / 100, 2)
    FROM yearly_goal WHERE year = YEAR(NOW())
    UNION ALL
    SELECT ul_id, year, 3, 'Objectif',
           ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage) / 100, 2)
    FROM yearly_goal WHERE year = YEAR(NOW())
    UNION ALL
    SELECT ul_id, year, 4, 'Objectif',
           ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage) / 100, 2)
    FROM yearly_goal WHERE year = YEAR(NOW())
    UNION ALL
    SELECT ul_id, year, 5, 'Objectif',
           ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage + day_5_percentage) / 100, 2)
    FROM yearly_goal WHERE year = YEAR(NOW())
    UNION ALL
    SELECT ul_id, year, 6, 'Objectif',
           ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage + day_5_percentage + day_6_percentage) / 100, 2)
    FROM yearly_goal WHERE year = YEAR(NOW())
    UNION ALL
    SELECT ul_id, year, 7, 'Objectif',
           ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage + day_5_percentage + day_6_percentage + day_7_percentage) / 100, 2)
    FROM yearly_goal WHERE year = YEAR(NOW())
    UNION ALL
    SELECT ul_id, year, 8, 'Objectif',
           ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage + day_5_percentage + day_6_percentage + day_7_percentage + day_8_percentage) / 100, 2)
    FROM yearly_goal WHERE year = YEAR(NOW())
    UNION ALL
    SELECT ul_id, year, 9, 'Objectif',
           ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage + day_5_percentage + day_6_percentage + day_7_percentage + day_8_percentage + day_9_percentage) / 100, 2)
    FROM yearly_goal WHERE year = YEAR(NOW())
)

-- ─── Final: Union of both series ─────────────────────────────────────────────
SELECT ul_id, year, jour_num, serie, montant_cumule
FROM realise_cumule

UNION ALL

SELECT ul_id, year, jour_num, serie, montant_cumule
FROM objectif_cumule

ORDER BY ul_id, year, serie, jour_num


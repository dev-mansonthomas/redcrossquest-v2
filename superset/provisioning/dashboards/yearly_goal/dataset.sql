-- Dashboard: Yearly Goal (Objectifs Annuels)
-- Description: Affiche le montant cumulé des objectifs par jour pour l'année en cours
-- Usage: Créer un Virtual Dataset dans Superset avec cette requête

SELECT 
    ul_id,
    year,
    'Jour 1' as jour,
    1 as jour_num,
    ROUND(amount * day_1_percentage / 100, 2) as montant_cumule
FROM yearly_goal
WHERE year = YEAR(NOW())
UNION ALL
SELECT ul_id, year, 'Jour 2', 2,
    ROUND(amount * (day_1_percentage + day_2_percentage) / 100, 2)
FROM yearly_goal WHERE year = YEAR(NOW())
UNION ALL
SELECT ul_id, year, 'Jour 3', 3,
    ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage) / 100, 2)
FROM yearly_goal WHERE year = YEAR(NOW())
UNION ALL
SELECT ul_id, year, 'Jour 4', 4,
    ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage) / 100, 2)
FROM yearly_goal WHERE year = YEAR(NOW())
UNION ALL
SELECT ul_id, year, 'Jour 5', 5,
    ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage + day_5_percentage) / 100, 2)
FROM yearly_goal WHERE year = YEAR(NOW())
UNION ALL
SELECT ul_id, year, 'Jour 6', 6,
    ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage + day_5_percentage + day_6_percentage) / 100, 2)
FROM yearly_goal WHERE year = YEAR(NOW())
UNION ALL
SELECT ul_id, year, 'Jour 7', 7,
    ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage + day_5_percentage + day_6_percentage + day_7_percentage) / 100, 2)
FROM yearly_goal WHERE year = YEAR(NOW())
UNION ALL
SELECT ul_id, year, 'Jour 8', 8,
    ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage + day_5_percentage + day_6_percentage + day_7_percentage + day_8_percentage) / 100, 2)
FROM yearly_goal WHERE year = YEAR(NOW())
UNION ALL
SELECT ul_id, year, 'Jour 9', 9,
    ROUND(amount * (day_1_percentage + day_2_percentage + day_3_percentage + day_4_percentage + day_5_percentage + day_6_percentage + day_7_percentage + day_8_percentage + day_9_percentage) / 100, 2)
FROM yearly_goal WHERE year = YEAR(NOW())
ORDER BY ul_id, jour_num


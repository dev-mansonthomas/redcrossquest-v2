-- =============================================================================
-- RCQ V2 — Table quete_dates + seed data
-- =============================================================================
-- Reference table storing the start date and duration of the quête for each year.
-- Replaces the hardcoded PHP values.
-- =============================================================================

CREATE TABLE IF NOT EXISTS `quete_dates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `year` int NOT NULL,
  `start_date` date NOT NULL,
  `nb_days` int NOT NULL COMMENT 'Nombre total de jours de quête (start_date + additional_days)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_year` (`year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed data for years 2004-2025
INSERT IGNORE INTO `quete_dates` (`year`, `start_date`, `nb_days`) VALUES
(2004, '2004-05-15', 2),
(2005, '2005-05-21', 2),
(2006, '2006-05-20', 2),
(2007, '2007-06-04', 7),
(2008, '2008-05-12', 7),
(2009, '2009-05-18', 7),
(2010, '2010-06-05', 7),
(2011, '2011-05-14', 8),
(2012, '2012-06-02', 8),
(2013, '2013-06-01', 9),
(2014, '2014-05-24', 9),
(2015, '2015-05-16', 9),
(2016, '2016-05-28', 9),
(2017, '2017-06-10', 9),
(2018, '2018-06-09', 9),
(2019, '2019-05-18', 9),
(2020, '2020-09-12', 7),
(2021, '2021-05-22', 9),
(2022, '2022-05-14', 9),
(2023, '2023-06-03', 9),
(2024, '2024-05-25', 9),
(2025, '2025-05-17', 9),
(2026, '2025-05-23', 9);

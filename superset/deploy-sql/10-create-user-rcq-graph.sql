-- ============================================================
-- 10-create-user-rcq-graph.sql
-- Creates the MySQL user 'rcq-graph' with:
--   - READ access to all tables (same as rcq_readonly)
--   - WRITE access on specific columns:
--     * queteur_mailing_status.spotfire_opened
--     * queteur_mailing_status.spotfire_open_date
--     * ul_settings.thanks_mail_benevole
--     * ul_settings.thanks_mail_benevole1j
-- ============================================================

-- Password is set via gcp-deploy.sh from .env.{env} RCQ_DB_PASSWORD
-- Database name below must match your actual database (e.g. rcq_fr_dev_db, rcq_fr_test_db, rcq_fr_prod_db)
CREATE USER IF NOT EXISTS 'rcq-graph'@'%' IDENTIFIED BY 'SET_VIA_DEPLOY_SCRIPT';

-- READ access on all tables in the database
GRANT SELECT ON `rcq_fr_dev_db`.* TO 'rcq-graph'@'%';

-- WRITE access on queteur_mailing_status (spotfire_opened, spotfire_open_date)
GRANT UPDATE ON `rcq_fr_dev_db`.queteur_mailing_status TO 'rcq-graph'@'%';

-- WRITE access on ul_settings (thanks_mail_benevole, thanks_mail_benevole1j) — for future WYSIWYG editor
GRANT UPDATE ON `rcq_fr_dev_db`.ul_settings TO 'rcq-graph'@'%';

-- Alternative : restriction au niveau colonne (plus restrictif)
-- Décommenter les lignes ci-dessous et commenter les GRANT UPDATE ci-dessus pour une restriction par colonne
-- GRANT UPDATE (spotfire_opened, spotfire_open_date) ON `rcq_fr_dev_db`.queteur_mailing_status TO 'rcq-graph'@'%';
-- GRANT UPDATE (thanks_mail_benevole, thanks_mail_benevole1j) ON `rcq_fr_dev_db`.ul_settings TO 'rcq-graph'@'%';

FLUSH PRIVILEGES;

-- =============================================================================
-- RCQ V2 — Anonymise sensitive data for non-production environments
-- =============================================================================
-- MUST be run after importing a production dump.
-- Replaces emails, phones, addresses, and resets passwords.
-- =============================================================================

UPDATE queteur        SET email='rcq@redcrossquest.com' WHERE id NOT IN (SELECT queteur_id FROM users);
UPDATE queteur        SET mobile='33601020304';
UPDATE users          SET password = 'AAAAAAA'; -- password : disabled, users have to reinit it.
UPDATE named_donation SET email='rcq@redcrossquest.com';
UPDATE named_donation SET phone='N/A';
UPDATE named_donation SET address='N/A';
UPDATE named_donation SET first_name='N/A';
UPDATE named_donation SET last_name ='N/A';
UPDATE users          SET password = '$2y$10$d8WTLEW8c8wiaR6ZjsJl.egsVxWi8ETZzeqIkU7JGqPJX/FYEWzce' WHERE role = 9; -- CRFCRF

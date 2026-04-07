-- ============================================================
-- 00-schema-migrations.sql
-- Creates the migration tracking table used by run-migrations.sh
-- This file MUST be the first migration (00-) so the table
-- exists before any other migration is recorded.
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(64)
);

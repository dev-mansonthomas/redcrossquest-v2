#!/usr/bin/env bash
# ============================================================
# run-migrations.sh — SQL migration runner for RedCrossQuest V2
#
# Usage:
#   ./scripts/run-migrations.sh local                 # Docker container
#   ./scripts/run-migrations.sh dev   [user] [pass]   # GCP dev
#   ./scripts/run-migrations.sh test  [user] [pass]   # GCP test
#   ./scripts/run-migrations.sh prod  [user] [pass]   # GCP prod
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/superset/deploy-sql"

# ── Argument parsing ────────────────────────────────────────
ENV="${1:-}"
DB_USER="${2:-}"
DB_PASS="${3:-}"

if [ -z "$ENV" ]; then
  echo "❌ Usage: $0 <local|dev|test|prod> [db_user] [db_password]"
  exit 1
fi

# ── Environment configuration ───────────────────────────────
MYSQL_DB="${MIGRATION_DB_NAME:-rcq_fr_dev_db}"

case "$ENV" in
  local)
    CONTAINER="rcq_mysql"
    ROOT_PASS="${MYSQL_ROOT_PASSWORD:-rcq_root_password}"
    # Build a function to run mysql commands via docker exec
    run_mysql() {
      docker exec -i "$CONTAINER" mysql -u root -p"$ROOT_PASS" "$MYSQL_DB" "$@"
    }
    ;;
  dev|test|prod)
    # Find mysql client binary (keg-only on macOS)
    MYSQL_CMD="mysql"
    if ! command -v mysql >/dev/null 2>&1; then
        if [ -x "/opt/homebrew/opt/mysql-client/bin/mysql" ]; then
            MYSQL_CMD="/opt/homebrew/opt/mysql-client/bin/mysql"
        elif [ -x "/usr/local/opt/mysql-client/bin/mysql" ]; then
            MYSQL_CMD="/usr/local/opt/mysql-client/bin/mysql"
        else
            echo "❌ MySQL client not found. Install with: brew install mysql-client"
            exit 1
        fi
    fi

    DB_HOST="${DB_HOST:-127.0.0.1}"
    DB_PORT="${DB_PORT:-3306}"
    DB_USER="${DB_USER:-root}"
    if [ -z "$DB_PASS" ]; then
      echo "❌ Password required for $ENV environment."
      echo "   Usage: $0 $ENV <user> <password>"
      echo "   Or set DB_HOST / DB_PORT env vars for Cloud SQL Proxy."
      exit 1
    fi

    # Create temp mysql config to avoid password warning
    MYSQL_CNF=$(mktemp)
    chmod 600 "$MYSQL_CNF"
    printf "[client]\npassword=%s\n" "$DB_PASS" > "$MYSQL_CNF"
    trap "rm -f $MYSQL_CNF" EXIT

    run_mysql() {
      $MYSQL_CMD --defaults-extra-file="$MYSQL_CNF" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$MYSQL_DB" "$@"
    }
    ;;
  *)
    echo "❌ Unknown environment: $ENV (expected: local, dev, test, prod)"
    exit 1
    ;;
esac

# ── Verify MySQL connectivity ───────────────────────────────
echo "🔌 Connecting to MySQL ($ENV)..."
if ! echo "SELECT 1;" | run_mysql --silent > /dev/null 2>&1; then
  echo "❌ Cannot connect to MySQL. Is the database running?"
  [ "$ENV" = "local" ] && echo "   Try: cd superset && docker compose up -d mysql"
  exit 1
fi
echo "✅ Connected."

# ── Collect migration files ─────────────────────────────────
mapfile -t MIGRATION_FILES < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' -type f | sort)

if [ ${#MIGRATION_FILES[@]} -eq 0 ]; then
  echo "⚠️  No SQL files found in $MIGRATIONS_DIR"
  exit 0
fi

# ── Ensure schema_migrations table exists (bootstrap) ───────
echo "SELECT 1 FROM schema_migrations LIMIT 1;" | run_mysql --silent > /dev/null 2>&1 || \
  run_mysql < "$MIGRATIONS_DIR/00-schema-migrations.sql"

# ── Get already-executed migrations ─────────────────────────
APPLIED=$(echo "SELECT filename FROM schema_migrations;" | run_mysql --silent --skip-column-names 2>/dev/null || true)

# ── Run pending migrations ──────────────────────────────────
APPLIED_COUNT=0
EXECUTED_COUNT=0

echo ""
echo "📋 Migration status:"
echo "───────────────────────────────────────────────"

for filepath in "${MIGRATION_FILES[@]}"; do
  filename="$(basename "$filepath")"

  if echo "$APPLIED" | grep -qxF "$filename"; then
    echo "  ✔ $filename (already applied)"
    APPLIED_COUNT=$((APPLIED_COUNT + 1))
    continue
  fi

  # Compute checksum (macOS uses md5, Linux uses md5sum)
  if command -v md5sum &>/dev/null; then
    CHECKSUM=$(md5sum "$filepath" | awk '{print $1}')
  elif command -v md5 &>/dev/null; then
    CHECKSUM=$(md5 -q "$filepath")
  else
    CHECKSUM="unknown"
  fi

  echo -n "  ▶ $filename ... "

  # Execute migration
  if run_mysql < "$filepath" 2>/dev/null; then
    # Record in schema_migrations
    echo "INSERT INTO schema_migrations (filename, checksum) VALUES ('$filename', '$CHECKSUM');" | run_mysql --silent
    echo "✅ done (checksum: ${CHECKSUM:0:12}…)"
    EXECUTED_COUNT=$((EXECUTED_COUNT + 1))
  else
    echo "❌ FAILED"
    echo ""
    echo "⛔ Migration $filename failed. Stopping."
    echo "   Fix the issue and re-run this script."
    exit 1
  fi
done

# ── Summary ─────────────────────────────────────────────────
echo "───────────────────────────────────────────────"
echo "📊 Summary: $EXECUTED_COUNT migration(s) executed, $APPLIED_COUNT already applied."

if [ "$EXECUTED_COUNT" -eq 0 ]; then
  echo "✅ Database is up to date — 0 migrations à appliquer."
fi

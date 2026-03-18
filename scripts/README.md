# RCQ V2 Scripts

This directory contains utility scripts for managing the RedCrossQuest V2 infrastructure.

## setup-git-hooks.sh

Bootstraps the repository pre-commit hooks used as a second line of defense against accidentally committing secrets.

### What it does

- Installs backend dev dependencies with Poetry (`pre-commit`, `detect-secrets`)
- Installs the repository `pre-commit` hook from the root `.pre-commit-config.yaml`
- Generates `.secrets.baseline` from tracked files when it does not exist yet

### Usage

```bash
./scripts/setup-git-hooks.sh
```

### Prerequisites

- Poetry installed
- Backend dependencies installable via `cd backend && poetry install --with dev`

### Verifying secret detection

```bash
echo 'AWS_SECRET_ACCESS_KEY=EXAMPLESECRET1234567890' > test-secret.txt
git add test-secret.txt
cd backend && poetry run pre-commit run detect-secrets --config ../.pre-commit-config.yaml --files ../test-secret.txt
rm test-secret.txt
git restore --staged test-secret.txt
```

## setup_metabase_db.sh

Interactive script to create the Metabase database schema and user in Cloud SQL MySQL.

### Features

- **Secure credential handling**: Passwords are prompted interactively and never stored in shell history
- **Environment selection**: Supports dev, test, and prod environments
- **Flexible connection**: Works with Cloud SQL Proxy or direct connection
- **Idempotent**: Safe to run multiple times (uses `CREATE IF NOT EXISTS`)

### Prerequisites

1. **Cloud SQL Proxy** (recommended for local development):
   ```bash
   # Install Cloud SQL Proxy
   gcloud components install cloud-sql-proxy

   # Or download from: https://cloud.google.com/sql/docs/mysql/sql-proxy
   ```

2. **MySQL client**:
   ```bash
   # macOS
   brew install mysql-client

   # Ubuntu/Debian
   sudo apt-get install mysql-client
   ```

3. **GCP authentication**:
   ```bash
   gcloud auth login
   gcloud config set project rcq-fr-dev  # or test/prod
   ```

4. **MySQL admin credentials**: You need a MySQL user with privileges to create databases and users (e.g., `root`)

### Usage

#### Option 1: Using Cloud SQL Proxy (Recommended)

1. Start Cloud SQL Proxy in a separate terminal:
   ```bash
   cloud-sql-proxy rcq-fr-dev:europe-west1:rcq-mysql-instance
   ```

2. Run the setup script:
   ```bash
   ./scripts/setup_metabase_db.sh
   ```

3. Follow the prompts:
   - Select environment (1 for dev)
   - Select connection method (1 for Cloud SQL Proxy)
   - Enter MySQL admin username (e.g., `root`)
   - Enter MySQL admin password
   - Enter and confirm new password for `rcq_metabase` user

#### Option 2: Direct Connection

1. Ensure your IP is whitelisted in Cloud SQL
2. Run the setup script:
   ```bash
   ./scripts/setup_metabase_db.sh
   ```

3. Follow the prompts:
   - Select environment
   - Select connection method (2 for direct)
   - Enter Cloud SQL public IP and port
   - Enter credentials as above

### What It Creates

- **Database**: `rcq_metabase_db` with UTF-8 encoding
- **User**: `rcq_metabase` with full privileges on `rcq_metabase_db`
- **Character set**: `utf8mb4` with `utf8mb4_unicode_ci` collation

### Storing Credentials in Secret Manager

After running the script, store the credentials in GCP Secret Manager:

```bash
# Store password (replace with actual password when prompted)
echo -n 'YOUR_PASSWORD_HERE' | gcloud secrets versions add rcq_metabase_db_password_dev --data-file=-

# Store username
echo -n 'rcq_metabase' | gcloud secrets versions add rcq_metabase_db_user_dev --data-file=-
```

Replace `dev` with `test` or `prod` for other environments.

### Security Notes

- ✅ Passwords are prompted with `read -s` (hidden input)
- ✅ Shell history is disabled during execution (`set +o history`)
- ✅ No credentials are hardcoded in the script
- ✅ Script is excluded from git history (add to `.gitignore` if needed)
- ⚠️ Remember to clear your terminal after running if others have access to your screen

### Troubleshooting

**Connection refused**:
- Ensure Cloud SQL Proxy is running
- Check that the instance name is correct
- Verify your GCP authentication

**Access denied**:
- Verify MySQL admin credentials
- Check that the admin user has `CREATE USER` and `GRANT` privileges

**Password mismatch**:
- Ensure you type the same password twice
- Passwords are case-sensitive

### Example Session

```
$ ./scripts/setup_metabase_db.sh
==========================================
RCQ Metabase Database Setup
==========================================

This script will create:
  - Database schema: rcq_metabase_db
  - Database user: rcq_metabase
  - Grant appropriate permissions

Select environment:
  1) dev (rcq-fr-dev)
  2) test (rcq-fr-test)
  3) prod (rcq-fr-prod)
Enter choice [1-3]: 1

Environment: dev (rcq-fr-dev)

Select connection method:
  1) Cloud SQL Proxy (recommended for local development)
  2) Direct connection (requires IP whitelisting)
Enter choice [1-2]: 1

Make sure Cloud SQL Proxy is running:
  cloud-sql-proxy rcq-fr-dev:europe-west1:rcq-mysql-instance

Press Enter when Cloud SQL Proxy is ready...

Enter MySQL admin credentials (for creating database and user):
MySQL admin username: root
MySQL admin password: [hidden]

Enter password for the new Metabase database user (rcq_metabase):
Metabase DB password: [hidden]
Confirm password: [hidden]

Creating database and user...

==========================================
✓ Setup completed successfully!
==========================================

Database: rcq_metabase_db
User: rcq_metabase
Host: 127.0.0.1:3306

Next steps:
1. Store the password in Secret Manager:
   echo -n 'YOUR_PASSWORD' | gcloud secrets versions add rcq_metabase_db_password_dev --data-file=-

2. Store the username in Secret Manager:
   echo -n 'rcq_metabase' | gcloud secrets versions add rcq_metabase_db_user_dev --data-file=-
```

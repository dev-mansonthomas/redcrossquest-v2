#!/usr/bin/env python3
"""Provision Superset dashboards from configuration files.

Usage:
    python provision_superset.py --env dev
    python provision_superset.py --env test
    python provision_superset.py --env prod
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv


class SupersetProvisioner:
    """Provision Superset resources via API."""

    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self._login(username, password)

    def _login(self, username: str, password: str) -> None:
        """Authenticate via form-based login to get session cookie."""
        # Load the login page to get the CSRF token and session cookie
        login_page = self.session.get(f"{self.base_url}/login/")
        login_page.raise_for_status()

        # Extract CSRF token - allow empty value (Superset 6.x may use empty CSRF on login)
        csrf_match = re.search(r'name="csrf_token"[^>]*value="([^"]*)"', login_page.text)
        if not csrf_match:
            csrf_match = re.search(r'id="csrf_token"[^>]*value="([^"]*)"', login_page.text)
        csrf_token = csrf_match.group(1) if csrf_match else ""

        # Submit the login form
        login_resp = self.session.post(
            f"{self.base_url}/login/",
            data={
                "username": username,
                "password": password,
                "csrf_token": csrf_token,
            },
            allow_redirects=True,
        )
        login_resp.raise_for_status()

        # Verify we're authenticated
        me_resp = self.session.get(f"{self.base_url}/api/v1/me/")
        me_data = me_resp.json().get("result", {})
        if me_data.get("is_anonymous", True):
            raise Exception("Login failed: session is still anonymous after form login")

        # Get CSRF token for API calls (POST/PUT/DELETE)
        csrf_resp = self.session.get(f"{self.base_url}/api/v1/security/csrf_token/")
        csrf_resp.raise_for_status()
        api_csrf = csrf_resp.json()["result"]
        self.session.headers.update({
            "X-CSRFToken": api_csrf,
            "Referer": self.base_url,
        })

        print(f"✅ Logged in to Superset as {username}")

    def _api_request(self, method: str, endpoint: str, **kwargs) -> dict:
        """Make an API request."""
        url = f"{self.base_url}/api/v1{endpoint}"
        resp = self.session.request(method, url, **kwargs)
        resp.raise_for_status()
        return resp.json() if resp.content else {}

    def _find_existing(self, endpoint: str, col: str, value: str) -> int | None:
        """Find existing resource by column value, return ID or None."""
        result = self._api_request(
            "GET", endpoint,
            params={"q": json.dumps({"filters": [{"col": col, "opr": "eq", "value": value}]})},
        )
        if result.get("count", 0) > 0:
            return result["result"][0]["id"]
        return None

    def create_database_connection(self, name: str, sqlalchemy_uri: str) -> int:
        """Create or find an existing database connection."""
        # First check if it already exists
        existing_id = self._find_existing("/database/", "database_name", name)
        if existing_id is not None:
            print(f"✅ Database connection '{name}' already exists (id={existing_id})")
            return existing_id

        # Try to create it
        try:
            result = self._api_request(
                "POST", "/database/",
                json={
                    "database_name": name,
                    "sqlalchemy_uri": sqlalchemy_uri,
                    "expose_in_sqllab": True,
                    "allow_ctas": False,
                    "allow_cvas": True,
                    "allow_dml": False,
                },
            )
            db_id = result["id"]
            print(f"✅ Created database connection '{name}' (id={db_id})")
            return db_id
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 422:
                error_body = e.response.json()
                if "already exists" in str(error_body):
                    # DB exists but was not found by _find_existing (permissions issue)
                    # Try listing ALL databases without filter
                    try:
                        all_dbs = self._api_request(
                            "GET", "/database/",
                            params={"q": json.dumps({"page_size": 1000})},
                        )
                        for db in all_dbs.get("result", []):
                            if db["database_name"] == name:
                                db_id = db["id"]
                                print(f"✅ Database connection '{name}' already exists (id={db_id})")
                                return db_id
                    except Exception:
                        pass

                    # Still not found via API — it exists in DB but is not visible via REST
                    print(
                        f"⚠️  Database '{name}' exists in Superset but is not visible via API. "
                        "Attempting direct lookup..."
                    )

                    # Try GET with a broader search (explicit columns)
                    try:
                        all_resp = self.session.get(
                            f"{self.base_url}/api/v1/database/",
                            params={"q": json.dumps({
                                "page_size": 1000,
                                "columns": ["id", "database_name"],
                            })},
                        )
                        if all_resp.ok:
                            for db in all_resp.json().get("result", []):
                                if db.get("database_name") == name:
                                    db_id = db["id"]
                                    print(f"✅ Found database '{name}' (id={db_id})")
                                    return db_id
                    except Exception:
                        pass

                    # Last resort: clear error message
                    print(f"❌ Database '{name}' exists but cannot be found via API.")
                    print("   Try deleting it from the Superset admin UI and re-running provisioning.")
                    print("   Or check Superset permissions for the admin user.")
            raise

    def upsert_dataset(self, db_id: int, name: str, sql: str, force_update: bool = False) -> int:
        """Create or update a virtual dataset from SQL."""
        existing_id = self._find_existing("/dataset/", "table_name", name)
        if existing_id is not None:
            if force_update:
                self._api_request(
                    "PUT", f"/dataset/{existing_id}",
                    json={"sql": sql},
                )
                print(f"✅ Updated dataset '{name}' (id={existing_id})")
                return existing_id
            else:
                print(f"✅ Skipped dataset '{name}' (already exists, use --force-update to overwrite)")
                return existing_id

        result = self._api_request(
            "POST", "/dataset/",
            json={
                "database": db_id,
                "schema": "",
                "table_name": name,
                "sql": sql,
            },
        )
        ds_id = result["id"]
        print(f"✅ Created dataset '{name}' (id={ds_id})")
        return ds_id

    def upsert_chart(self, dataset_id: int, config: dict, force_update: bool = False) -> int:
        """Create or update a chart."""
        name = config["name"]
        existing_id = self._find_existing("/chart/", "slice_name", name)
        if existing_id is not None:
            if force_update:
                self._api_request(
                    "PUT", f"/chart/{existing_id}",
                    json={
                        "params": json.dumps(config.get("params", {})),
                        "viz_type": config.get("viz_type", "echarts_timeseries_line"),
                    },
                )
                print(f"✅ Updated chart '{name}' (id={existing_id})")
                return existing_id
            else:
                print(f"✅ Skipped chart '{name}' (already exists, use --force-update to overwrite)")
                return existing_id

        result = self._api_request(
            "POST", "/chart/",
            json={
                "slice_name": name,
                "viz_type": config.get("viz_type", "echarts_timeseries_line"),
                "datasource_id": dataset_id,
                "datasource_type": "table",
                "description": config.get("description", ""),
                "params": json.dumps(config.get("params", {})),
            },
        )
        chart_id = result["id"]
        print(f"✅ Created chart '{name}' (id={chart_id})")
        return chart_id

    def upsert_dashboard(self, config: dict, chart_ids: list[int], force_update: bool = False) -> int:
        """Create or update a dashboard with charts."""
        title = config["dashboard_title"]

        # Build position_json that places all charts in a single column layout
        position = {
            "DASHBOARD_VERSION_KEY": "v2",
            "ROOT_ID": {"type": "ROOT", "id": "ROOT_ID", "children": ["GRID_ID"]},
            "GRID_ID": {"type": "GRID", "id": "GRID_ID", "children": [], "parents": ["ROOT_ID"]},
            "HEADER_ID": {"type": "HEADER", "id": "HEADER_ID", "meta": {"text": title}},
        }

        for i, chart_id in enumerate(chart_ids):
            row_id = f"ROW-{i + 1}"
            chart_key = f"CHART-{chart_id}"

            position["GRID_ID"]["children"].append(row_id)
            position[row_id] = {
                "type": "ROW",
                "id": row_id,
                "children": [chart_key],
                "parents": ["ROOT_ID", "GRID_ID"],
                "meta": {"background": "BACKGROUND_TRANSPARENT"},
            }
            position[chart_key] = {
                "type": "CHART",
                "id": chart_key,
                "children": [],
                "parents": ["ROOT_ID", "GRID_ID", row_id],
                "meta": {
                    "chartId": chart_id,
                    "width": 12,
                    "height": 200,
                    "sliceName": title,
                },
            }

        dashboard_payload = {
            "dashboard_title": title,
            "slug": config.get("slug", ""),
            "published": config.get("published", True),
            "position_json": json.dumps(position),
            "json_metadata": json.dumps(config.get("json_metadata", {})),
        }

        existing_id = self._find_existing("/dashboard/", "dashboard_title", title)
        if existing_id is not None:
            if force_update:
                self._api_request("PUT", f"/dashboard/{existing_id}", json=dashboard_payload)
                print(f"✅ Updated dashboard '{title}' (id={existing_id})")
                return existing_id
            else:
                print(f"✅ Skipped dashboard '{title}' (already exists, use --force-update to overwrite)")
                return existing_id

        result = self._api_request("POST", "/dashboard/", json=dashboard_payload)
        dash_id = result["id"]
        print(f"✅ Created dashboard '{title}' (id={dash_id})")
        return dash_id

    def import_theme_from_zip(self, zip_path: Path, theme_name: str) -> int:
        """Import a theme from a ZIP file via Superset import API."""
        existing_id = self._find_existing("/css_template/", "template_name", theme_name)
        if existing_id is not None:
            print(f"✅ Theme '{theme_name}' already exists (id={existing_id})")
            return existing_id

        print(f"📦 Importing theme from {zip_path}...")
        with open(zip_path, "rb") as f:
            response = self.session.post(
                f"{self.base_url}/api/v1/assets/import/",
                files={"bundle": (zip_path.name, f, "application/zip")},
                data={"passwords": "{}", "overwrite": "true"},
            )

        if response.status_code == 200:
            new_id = self._find_existing("/css_template/", "template_name", theme_name)
            if new_id is not None:
                print(f"✅ Imported theme '{theme_name}' (id={new_id})")
                return new_id
            # Theme might not be a css_template but a Superset theme - check if import succeeded
            result = response.json()
            if result.get("message") == "OK" or response.ok:
                print(f"✅ Theme '{theme_name}' imported successfully")
                return 0

        # If /api/v1/assets/import/ also fails, skip gracefully instead of crashing
        print(f"⚠️  Could not import theme '{theme_name}': {response.status_code} - skipping")
        return 0

    def apply_theme_to_dashboard(self, dashboard_id: int, theme_name: str) -> None:
        """Apply a CSS template/theme to a dashboard."""
        response = self._api_request(
            "GET", "/css_template/",
            params={"q": json.dumps({"filters": [{"col": "template_name", "opr": "eq", "value": theme_name}]})},
        )

        if response.get("count", 0) == 0:
            print(f"⚠️  Theme '{theme_name}' not found, skipping")
            return

        css_content = response["result"][0].get("css", "")

        self._api_request(
            "PUT", f"/dashboard/{dashboard_id}",
            json={"css": css_content},
        )
        print(f"✅ Applied theme '{theme_name}' to dashboard {dashboard_id}")

    def enable_embedding(self, dashboard_id: int, allowed_domains: list[str]) -> str:
        """Enable embedding for a dashboard and return the UUID."""
        result = self._api_request(
            "POST",
            f"/dashboard/{dashboard_id}/embedded",
            json={"allowed_domains": allowed_domains},
        )
        uuid = result.get("result", {}).get("uuid", "")
        print(f"✅ Enabled embedding for dashboard {dashboard_id}, UUID: {uuid}")
        return uuid


def provision_dashboard(
    provisioner: SupersetProvisioner,
    dashboard_dir: Path,
    db_id: int,
    allowed_domains: list[str],
    force_update: bool = False,
) -> dict:
    """Provision a single dashboard from config files."""
    print(f"\n📊 Provisioning dashboard from {dashboard_dir.name}...")

    # Load configs
    metadata = json.loads((dashboard_dir / "metadata.json").read_text())
    dataset_sql = (dashboard_dir / "dataset.sql").read_text()
    chart_config = json.loads((dashboard_dir / "chart.json").read_text())
    dashboard_config = json.loads((dashboard_dir / "dashboard.json").read_text())

    # Create or update resources
    dataset_id = provisioner.upsert_dataset(db_id, f"{metadata['name']}_dataset", dataset_sql, force_update)
    chart_id = provisioner.upsert_chart(dataset_id, chart_config, force_update)
    dashboard_id = provisioner.upsert_dashboard(dashboard_config, [chart_id], force_update)

    # Associate charts with dashboard (M2M relationship required by Superset)
    chart_ids = [chart_id]
    for cid in chart_ids:
        provisioner._api_request(
            "PUT", f"/chart/{cid}",
            json={"dashboards": [dashboard_id]}
        )
    print(f"   🔗 Associated {len(chart_ids)} chart(s) with dashboard")

    embed_uuid = provisioner.enable_embedding(dashboard_id, allowed_domains)

    # Import and apply theme from ZIP if available
    script_dir = Path(__file__).parent.parent
    theme_zip = script_dir / "themes" / "superset_light_theme.zip"
    if theme_zip.exists():
        provisioner.import_theme_from_zip(theme_zip, "THEME_LIGHT")
        provisioner.apply_theme_to_dashboard(dashboard_id, "THEME_LIGHT")

    return {
        "name": metadata["name"],
        "dataset_id": dataset_id,
        "chart_id": chart_id,
        "dashboard_id": dashboard_id,
        "embed_uuid": embed_uuid,
    }


def update_backend_env(dashboard_key: str, embed_uuid: str, backend_env_path: Path) -> bool:
    """Update the backend .env file with the new dashboard UUID."""
    env_var_name = f"SUPERSET_DASHBOARD_{dashboard_key.upper()}"

    if not backend_env_path.exists():
        print(f"⚠️  Backend .env not found at {backend_env_path}")
        return False

    content = backend_env_path.read_text()
    lines = content.splitlines()
    updated = False
    new_lines = []

    for line in lines:
        if line.startswith(f"{env_var_name}="):
            new_lines.append(f"{env_var_name}={embed_uuid}")
            updated = True
            print(f"✅ Updated {env_var_name} in {backend_env_path}")
        else:
            new_lines.append(line)

    if not updated:
        # Add the variable if it doesn't exist
        new_lines.append(f"{env_var_name}={embed_uuid}")
        print(f"✅ Added {env_var_name} to {backend_env_path}")

    backend_env_path.write_text("\n".join(new_lines) + "\n")
    return True


def restart_backend() -> bool:
    """Restart the backend container to apply new env vars."""
    import subprocess

    print("🔄 Restarting backend to apply new configuration...")
    result = subprocess.run(
        [
            "docker", "compose", "-p", "rcq", "-f", "docker-compose.dev.yml",
            "up", "-d", "--force-recreate", "backend",
        ],
        capture_output=True,
        text=True,
        cwd=Path(__file__).parent.parent.parent.parent,  # repo root
    )

    if result.returncode == 0:
        print("✅ Backend restarted successfully")
        return True
    else:
        print(f"❌ Failed to restart backend: {result.stderr}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Provision Superset dashboards")
    parser.add_argument("--env", required=True, help="Environment (dev, test, prod)")
    parser.add_argument("--dashboard", help="Specific dashboard to provision (default: all)")
    parser.add_argument(
        "--auto-restart",
        action="store_true",
        help="Automatically restart the backend after provisioning",
    )
    parser.add_argument(
        "--skip-theme",
        action="store_true",
        help="Skip THEME_LIGHT import and application",
    )
    parser.add_argument(
        "--force-update",
        action="store_true",
        help="Update existing resources instead of skipping them",
    )
    parser.add_argument(
        "--no-restart",
        action="store_true",
        help="Skip the backend restart prompt",
    )
    args = parser.parse_args()

    # Load environment
    script_dir = Path(__file__).parent.parent
    env_file = script_dir / f".env.{args.env}"

    if not env_file.exists():
        print(f"❌ Environment file not found: {env_file}")
        sys.exit(1)

    load_dotenv(env_file)
    print(f"📁 Loaded environment from {env_file}")

    # Get config from env
    superset_url = os.environ["SUPERSET_URL"]
    superset_user = os.environ["SUPERSET_ADMIN_USER"]
    superset_password = os.environ["SUPERSET_ADMIN_PASSWORD"]
    db_name = os.environ["DB_CONNECTION_NAME"]
    db_uri = os.environ["DB_SQLALCHEMY_URI"]
    allowed_domains = os.environ.get("EMBEDDING_ALLOWED_DOMAINS", "").split(",")

    # Initialize provisioner
    provisioner = SupersetProvisioner(superset_url, superset_user, superset_password)

    # Import THEME_LIGHT from ZIP if not skipped
    if not args.skip_theme:
        theme_zip = script_dir / "themes" / "superset_light_theme.zip"
        if theme_zip.exists():
            provisioner.import_theme_from_zip(theme_zip, "THEME_LIGHT")
            print("✅ THEME_LIGHT theme imported from ZIP")
        else:
            print(f"⚠️  Theme ZIP not found at {theme_zip}")

    # Create database connection
    db_id = provisioner.create_database_connection(db_name, db_uri)

    # Provision dashboards
    dashboards_dir = script_dir / "dashboards"
    results = []

    for dashboard_dir in sorted(dashboards_dir.iterdir()):
        if dashboard_dir.is_dir():
            if args.dashboard and dashboard_dir.name != args.dashboard:
                continue
            result = provision_dashboard(provisioner, dashboard_dir, db_id, allowed_domains, args.force_update)
            results.append(result)

    # Update backend .env with embed UUIDs
    repo_root = script_dir.parent.parent  # superset/provisioning -> superset -> repo root
    default_backend_env = str(repo_root / "backend" / ".env")
    backend_env_path = Path(
        os.environ.get("BACKEND_ENV_PATH", default_backend_env)
    )
    if not backend_env_path.is_absolute():
        backend_env_path = script_dir / backend_env_path

    for r in results:
        update_backend_env(r["name"], r["embed_uuid"], backend_env_path)

    # Restart backend if requested
    if results:
        if args.auto_restart:
            restart_backend()
        elif args.no_restart:
            print("\n⏭️  Skipping restart (--no-restart)")
        else:
            try:
                answer = input("\n🔄 Restart backend now? [y/N] ").strip().lower()
                if answer == "y":
                    restart_backend()
            except EOFError:
                print("\n⏭️  Non-interactive mode, skipping restart.")

    # Summary
    print("\n" + "=" * 50)
    print("📊 PROVISIONING COMPLETE")
    print("=" * 50)
    for r in results:
        print(f"\n{r['name']}:")
        print(f"  Dashboard ID: {r['dashboard_id']}")
        print(f"  Embed UUID:   {r['embed_uuid']}")
    print()


if __name__ == "__main__":
    main()

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
        """Authenticate and get access token."""
        # Get CSRF token
        csrf_url = f"{self.base_url}/api/v1/security/csrf_token/"
        csrf_resp = self.session.get(csrf_url)
        csrf_resp.raise_for_status()
        csrf_token = csrf_resp.json()["result"]

        # Login
        login_url = f"{self.base_url}/api/v1/security/login"
        login_resp = self.session.post(
            login_url,
            json={
                "username": username,
                "password": password,
                "provider": "db",
            },
            headers={"X-CSRFToken": csrf_token},
        )
        login_resp.raise_for_status()
        access_token = login_resp.json()["access_token"]

        self.session.headers.update({
            "Authorization": f"Bearer {access_token}",
            "X-CSRFToken": csrf_token,
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
        """Create or update a database connection."""
        existing_id = self._find_existing("/database/", "database_name", name)
        if existing_id is not None:
            print(f"✅ Database connection '{name}' already exists (id={existing_id})")
            return existing_id

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

    def create_dataset(self, db_id: int, name: str, sql: str) -> int:
        """Create a virtual dataset from SQL."""
        existing_id = self._find_existing("/dataset/", "table_name", name)
        if existing_id is not None:
            print(f"✅ Dataset '{name}' already exists (id={existing_id})")
            return existing_id

        result = self._api_request(
            "POST", "/dataset/",
            json={
                "database": db_id,
                "schema": "",
                "table_name": name,
                "sql": sql,
                "is_sqllab_view": True,
            },
        )
        ds_id = result["id"]
        print(f"✅ Created dataset '{name}' (id={ds_id})")
        return ds_id

    def create_chart(self, dataset_id: int, config: dict) -> int:
        """Create a chart."""
        name = config["name"]
        existing_id = self._find_existing("/chart/", "slice_name", name)
        if existing_id is not None:
            print(f"✅ Chart '{name}' already exists (id={existing_id})")
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

    def create_dashboard(self, config: dict, chart_ids: list[int]) -> int:
        """Create a dashboard with charts."""
        title = config["dashboard_title"]
        existing_id = self._find_existing("/dashboard/", "dashboard_title", title)
        if existing_id is not None:
            print(f"✅ Dashboard '{title}' already exists (id={existing_id})")
            return existing_id

        result = self._api_request(
            "POST", "/dashboard/",
            json={
                "dashboard_title": title,
                "slug": config.get("slug", ""),
                "published": config.get("published", True),
                "json_metadata": json.dumps(config.get("json_metadata", {})),
            },
        )
        dash_id = result["id"]
        print(f"✅ Created dashboard '{title}' (id={dash_id})")
        # TODO: Add charts to dashboard layout
        return dash_id

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
) -> dict:
    """Provision a single dashboard from config files."""
    print(f"\n📊 Provisioning dashboard from {dashboard_dir.name}...")

    # Load configs
    metadata = json.loads((dashboard_dir / "metadata.json").read_text())
    dataset_sql = (dashboard_dir / "dataset.sql").read_text()
    chart_config = json.loads((dashboard_dir / "chart.json").read_text())
    dashboard_config = json.loads((dashboard_dir / "dashboard.json").read_text())

    # Create resources
    dataset_id = provisioner.create_dataset(db_id, f"{metadata['name']}_dataset", dataset_sql)
    chart_id = provisioner.create_chart(dataset_id, chart_config)
    dashboard_id = provisioner.create_dashboard(dashboard_config, [chart_id])
    embed_uuid = provisioner.enable_embedding(dashboard_id, allowed_domains)

    return {
        "name": metadata["name"],
        "dataset_id": dataset_id,
        "chart_id": chart_id,
        "dashboard_id": dashboard_id,
        "embed_uuid": embed_uuid,
    }


def main():
    parser = argparse.ArgumentParser(description="Provision Superset dashboards")
    parser.add_argument("--env", required=True, help="Environment (dev, test, prod)")
    parser.add_argument("--dashboard", help="Specific dashboard to provision (default: all)")
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

    # Create database connection
    db_id = provisioner.create_database_connection(db_name, db_uri)

    # Provision dashboards
    dashboards_dir = script_dir / "dashboards"
    results = []

    for dashboard_dir in sorted(dashboards_dir.iterdir()):
        if dashboard_dir.is_dir():
            if args.dashboard and dashboard_dir.name != args.dashboard:
                continue
            result = provision_dashboard(provisioner, dashboard_dir, db_id, allowed_domains)
            results.append(result)

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

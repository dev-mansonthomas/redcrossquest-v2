#!/usr/bin/env python3
"""Bootstrap Superset dashboard: Leaderboard Collecteurs.

Creates virtual dataset, charts, and dashboard via Superset API.
Usage: python scripts/bootstrap_leaderboard_collecteurs.py
"""
import json
import sys
import urllib.request
import urllib.error

SUPERSET_URL = "http://localhost:8088"
USERNAME = "admin"
PASSWORD = "admin"  # noqa: S105
DATABASE_ID = 1

VIRTUAL_DATASET_SQL = """
SELECT
  q.id                                                          AS queteur_id,
  CONCAT(q.first_name, ' ', SUBSTRING(q.last_name, 1, 1), '.') AS nom_queteur,
  q.ul_id,
  COUNT(*)                                                      AS nb_troncs,
  ROUND(SUM(
    COALESCE(tq.euro500,0)*500 + COALESCE(tq.euro200,0)*200 + COALESCE(tq.euro100,0)*100 +
    COALESCE(tq.euro50,0)*50  + COALESCE(tq.euro20,0)*20  + COALESCE(tq.euro10,0)*10  +
    COALESCE(tq.euro5,0)*5   + COALESCE(tq.euro2,0)*2   + COALESCE(tq.euro1,0)*1   +
    COALESCE(tq.cents50,0)*0.5 + COALESCE(tq.cents20,0)*0.2 + COALESCE(tq.cents10,0)*0.1 +
    COALESCE(tq.cents5,0)*0.05 + COALESCE(tq.cents2,0)*0.02 + COALESCE(tq.cent1,0)*0.01 +
    COALESCE(tq.don_creditcard,0) + COALESCE(tq.don_cheque,0)
  ), 2)                                                         AS total_collecte,
  ROUND(AVG(
    COALESCE(tq.euro500,0)*500 + COALESCE(tq.euro200,0)*200 + COALESCE(tq.euro100,0)*100 +
    COALESCE(tq.euro50,0)*50  + COALESCE(tq.euro20,0)*20  + COALESCE(tq.euro10,0)*10  +
    COALESCE(tq.euro5,0)*5   + COALESCE(tq.euro2,0)*2   + COALESCE(tq.euro1,0)*1   +
    COALESCE(tq.cents50,0)*0.5 + COALESCE(tq.cents20,0)*0.2 + COALESCE(tq.cents10,0)*0.1 +
    COALESCE(tq.cents5,0)*0.05 + COALESCE(tq.cents2,0)*0.02 + COALESCE(tq.cent1,0)*0.01 +
    COALESCE(tq.don_creditcard,0) + COALESCE(tq.don_cheque,0)
  ), 2)                                                         AS moyenne,
  RANK() OVER (PARTITION BY q.ul_id ORDER BY SUM(
    COALESCE(tq.euro500,0)*500 + COALESCE(tq.euro200,0)*200 + COALESCE(tq.euro100,0)*100 +
    COALESCE(tq.euro50,0)*50  + COALESCE(tq.euro20,0)*20  + COALESCE(tq.euro10,0)*10  +
    COALESCE(tq.euro5,0)*5   + COALESCE(tq.euro2,0)*2   + COALESCE(tq.euro1,0)*1   +
    COALESCE(tq.cents50,0)*0.5 + COALESCE(tq.cents20,0)*0.2 + COALESCE(tq.cents10,0)*0.1 +
    COALESCE(tq.cents5,0)*0.05 + COALESCE(tq.cents2,0)*0.02 + COALESCE(tq.cent1,0)*0.01 +
    COALESCE(tq.don_creditcard,0) + COALESCE(tq.don_cheque,0)
  ) DESC)                                                       AS rang
FROM queteur q
JOIN tronc_queteur tq ON q.id = tq.queteur_id
WHERE tq.comptage IS NOT NULL
  AND tq.deleted  = 0
  AND YEAR(tq.comptage) = YEAR(CURDATE())
GROUP BY q.id, q.first_name, q.last_name, q.ul_id
ORDER BY total_collecte DESC
""".strip()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def api(path, *, method="GET", data=None, token=None, csrf=None):
    """Call Superset REST API and return parsed JSON."""
    url = f"{SUPERSET_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if csrf:
        headers["X-CSRFToken"] = csrf
        headers["Referer"] = SUPERSET_URL
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode() if exc.fp else str(exc)
        print(f"  ✗ {method} {path} → {exc.code}: {detail}", file=sys.stderr)
        raise


def login():
    r = api("/api/v1/security/login", method="POST",
            data={"username": USERNAME, "password": PASSWORD, "provider": "db"})
    return r["access_token"]


def csrf_token(token):
    r = api("/api/v1/security/csrf_token/", token=token)
    return r["result"]


# ---------------------------------------------------------------------------
# Create resources
# ---------------------------------------------------------------------------

def create_dataset(token, csrf):
    """Create the virtual dataset."""
    print("📊 Creating virtual dataset 'leaderboard_collecteurs'...")
    data = {
        "database": DATABASE_ID,
        "schema": "rcq_fr_dev_db",
        "table_name": "leaderboard_collecteurs",
        "sql": VIRTUAL_DATASET_SQL,
    }
    r = api("/api/v1/dataset/", method="POST", data=data, token=token, csrf=csrf)
    ds_id = r["id"]
    print(f"  ✓ Dataset created (id={ds_id})")
    return ds_id


def create_table_chart(token, csrf, dataset_id):
    """Create Top 20 table chart."""
    print("📋 Creating table chart 'Top 20 Collecteurs'...")
    data = {
        "slice_name": "Top 20 Collecteurs",
        "viz_type": "table",
        "datasource_id": dataset_id,
        "datasource_type": "table",
        "params": json.dumps({
            "datasource": f"{dataset_id}__table",
            "viz_type": "table",
            "query_mode": "raw",
            "all_columns": ["rang", "nom_queteur", "nb_troncs", "total_collecte", "moyenne"],
            "order_by_cols": [json.dumps(["rang", True])],
            "server_page_length": 20,
            "row_limit": 20,
            "include_time": False,
            "color_pn": True,
            "column_config": {
                "total_collecte": {"d3SmallNumberFormat": ",.2f", "d3NumberFormat": ",.2f", "currencyCode": "EUR"},
                "moyenne": {"d3SmallNumberFormat": ",.2f", "d3NumberFormat": ",.2f", "currencyCode": "EUR"},
            },
            "header_font_size": 0.3,
            "cell_font_size": 0.3,
        }),
    }
    r = api("/api/v1/chart/", method="POST", data=data, token=token, csrf=csrf)
    chart_id = r["id"]
    print(f"  ✓ Table chart created (id={chart_id})")
    return chart_id


def create_bar_chart(token, csrf, dataset_id):
    """Create Top 10 horizontal bar chart."""
    print("📊 Creating bar chart 'Top 10 Collecteurs'...")
    data = {
        "slice_name": "Top 10 Collecteurs",
        "viz_type": "echarts_bar",
        "datasource_id": dataset_id,
        "datasource_type": "table",
        "params": json.dumps({
            "datasource": f"{dataset_id}__table",
            "viz_type": "echarts_bar",
            "x_axis": "nom_queteur",
            "metrics": [{"label": "total_collecte", "expressionType": "SIMPLE",
                         "column": {"column_name": "total_collecte"}, "aggregate": "MAX"}],
            "groupby": [],
            "row_limit": 10,
            "order_desc": True,
            "orientation": "horizontal",
            "show_legend": False,
            "x_axis_title": "Montant collecté (€)",
            "y_axis_title": "",
            "rich_tooltip": True,
            "bar_stacked": False,
            "color_scheme": "supersetColors",
            "show_value": True,
        }),
    }
    r = api("/api/v1/chart/", method="POST", data=data, token=token, csrf=csrf)
    chart_id = r["id"]
    print(f"  ✓ Bar chart created (id={chart_id})")
    return chart_id


def create_big_number_chart(token, csrf, dataset_id):
    """Create big number chart for total participants."""
    print("🔢 Creating big number chart 'Nombre de Participants'...")
    data = {
        "slice_name": "Nombre de Participants",
        "viz_type": "big_number_total",
        "datasource_id": dataset_id,
        "datasource_type": "table",
        "params": json.dumps({
            "datasource": f"{dataset_id}__table",
            "viz_type": "big_number_total",
            "metric": {"label": "COUNT(*)", "expressionType": "SQL", "sqlExpression": "COUNT(*)"},
            "header_font_size": 0.4,
            "subheader_font_size": 0.15,
            "subheader": "quêteurs actifs cette année",
            "y_axis_format": "SMART_NUMBER",
        }),
    }
    r = api("/api/v1/chart/", method="POST", data=data, token=token, csrf=csrf)
    chart_id = r["id"]
    print(f"  ✓ Big number chart created (id={chart_id})")
    return chart_id


def create_dashboard(token, csrf, table_id, bar_id, big_number_id):
    """Create the dashboard and enable embedding."""
    print("🖥️  Creating dashboard 'Leaderboard Collecteurs'...")
    position = {
        "DASHBOARD_VERSION_KEY": "v2",
        "ROOT_ID": {"type": "ROOT", "id": "ROOT_ID", "children": ["GRID_ID"]},
        "GRID_ID": {"type": "GRID", "id": "GRID_ID", "children": ["ROW-top", "ROW-bottom"], "parents": ["ROOT_ID"]},
        "HEADER_ID": {"type": "HEADER", "id": "HEADER_ID", "meta": {"text": "Leaderboard Collecteurs"}},
        "ROW-top": {
            "type": "ROW", "id": "ROW-top",
            "children": [f"CHART-big-{big_number_id}", f"CHART-bar-{bar_id}"],
            "parents": ["ROOT_ID", "GRID_ID"],
            "meta": {"background": "BACKGROUND_TRANSPARENT"},
        },
        f"CHART-big-{big_number_id}": {
            "type": "CHART", "id": f"CHART-big-{big_number_id}",
            "children": [],
            "parents": ["ROOT_ID", "GRID_ID", "ROW-top"],
            "meta": {"width": 3, "height": 12, "chartId": big_number_id, "sliceName": "Nombre de Participants"},
        },
        f"CHART-bar-{bar_id}": {
            "type": "CHART", "id": f"CHART-bar-{bar_id}",
            "children": [],
            "parents": ["ROOT_ID", "GRID_ID", "ROW-top"],
            "meta": {"width": 9, "height": 12, "chartId": bar_id, "sliceName": "Top 10 Collecteurs"},
        },
        "ROW-bottom": {
            "type": "ROW", "id": "ROW-bottom",
            "children": [f"CHART-table-{table_id}"],
            "parents": ["ROOT_ID", "GRID_ID"],
            "meta": {"background": "BACKGROUND_TRANSPARENT"},
        },
        f"CHART-table-{table_id}": {
            "type": "CHART", "id": f"CHART-table-{table_id}",
            "children": [],
            "parents": ["ROOT_ID", "GRID_ID", "ROW-bottom"],
            "meta": {"width": 12, "height": 16, "chartId": table_id, "sliceName": "Top 20 Collecteurs"},
        },
    }
    data = {
        "dashboard_title": "Leaderboard Collecteurs",
        "published": True,
        "position_json": json.dumps(position),
    }
    r = api("/api/v1/dashboard/", method="POST", data=data, token=token, csrf=csrf)
    dash_id = r["id"]
    print(f"  ✓ Dashboard created (id={dash_id})")

    # Enable embedding
    print("🔗 Enabling embedding...")
    embed_r = api(f"/api/v1/dashboard/{dash_id}/embedded", method="POST",
                  data={"allowed_domains": []}, token=token, csrf=csrf)
    uuid = embed_r["result"]["uuid"]
    print(f"  ✓ Embedding enabled (uuid={uuid})")
    return dash_id, uuid


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("  Superset Bootstrap: Leaderboard Collecteurs")
    print("=" * 60)

    token = login()
    print("  ✓ Logged in")
    csrf = csrf_token(token)
    print("  ✓ CSRF token obtained")

    dataset_id = create_dataset(token, csrf)
    table_id = create_table_chart(token, csrf, dataset_id)
    bar_id = create_bar_chart(token, csrf, dataset_id)
    big_number_id = create_big_number_chart(token, csrf, dataset_id)
    dash_id, dash_uuid = create_dashboard(token, csrf, table_id, bar_id, big_number_id)

    print()
    print("=" * 60)
    print(f"  ✅ Dashboard ready!")
    print(f"     ID   : {dash_id}")
    print(f"     UUID : {dash_uuid}")
    print(f"     URL  : {SUPERSET_URL}/superset/dashboard/{dash_id}/")
    print("=" * 60)
    return dash_uuid


if __name__ == "__main__":
    main()



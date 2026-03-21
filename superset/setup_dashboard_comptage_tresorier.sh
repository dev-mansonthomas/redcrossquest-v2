#!/bin/bash
# Setup Superset Dashboard: Comptage Trésorier
# Creates virtual dataset, charts, and dashboard via Superset API
set -e

SUPERSET_URL="${SUPERSET_URL:-http://localhost:8088}"
SUPERSET_USER="${SUPERSET_USER:-admin}"
SUPERSET_PASS="${SUPERSET_PASS:-admin}"

echo "🔐 Logging into Superset..."
TOKEN=$(curl -sf "${SUPERSET_URL}/api/v1/security/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${SUPERSET_USER}\",\"password\":\"${SUPERSET_PASS}\",\"provider\":\"db\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

AUTH="Authorization: Bearer ${TOKEN}"
CT="Content-Type: application/json"

# Get CSRF token
CSRF=$(curl -sf "${SUPERSET_URL}/api/v1/security/csrf_token/" -H "$AUTH" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])")
CSRF_H="X-CSRFToken: ${CSRF}"
REFERER="Referer: ${SUPERSET_URL}"

api_post() {
  local path="$1" data="$2"
  curl -sf "${SUPERSET_URL}${path}" -H "$AUTH" -H "$CT" -H "$CSRF_H" -H "$REFERER" -d "$data"
}

api_put() {
  local path="$1" data="$2"
  curl -sf "${SUPERSET_URL}${path}" -X PUT -H "$AUTH" -H "$CT" -H "$CSRF_H" -H "$REFERER" -d "$data"
}

# ─── 1. Virtual Dataset ───────────────────────────────────────────
echo "📊 Creating virtual dataset 'comptage_tresorier'..."

DATASET_SQL=$(cat <<'EOSQL'
SELECT 
  tq.id,
  tq.ul_id,
  DATE(tq.comptage) as date_comptage,
  tq.comptage as datetime_comptage,
  tq.retour as datetime_retour,
  tq.queteur_id,
  q.first_name,
  q.last_name,
  CONCAT(q.first_name, ' ', q.last_name) as queteur_name,
  pq.name as point_quete,
  CASE WHEN tq.comptage IS NOT NULL THEN 'Compté' ELSE 'Non compté' END as statut,
  COALESCE(tq.euro500 * 500, 0) + COALESCE(tq.euro200 * 200, 0) + COALESCE(tq.euro100 * 100, 0) +
  COALESCE(tq.euro50 * 50, 0) + COALESCE(tq.euro20 * 20, 0) + COALESCE(tq.euro10 * 10, 0) +
  COALESCE(tq.euro5 * 5, 0) as total_billets,
  COALESCE(tq.euro2 * 2, 0) + COALESCE(tq.euro1, 0) + COALESCE(tq.cents50 * 0.5, 0) +
  COALESCE(tq.cents20 * 0.2, 0) + COALESCE(tq.cents10 * 0.1, 0) + COALESCE(tq.cents5 * 0.05, 0) +
  COALESCE(tq.cents2 * 0.02, 0) + COALESCE(tq.cent1 * 0.01, 0) as total_pieces,
  COALESCE(tq.don_cheque, 0) as total_cheques,
  COALESCE(tq.don_creditcard, 0) as total_cb,
  COALESCE(tq.euro500 * 500, 0) + COALESCE(tq.euro200 * 200, 0) + COALESCE(tq.euro100 * 100, 0) +
  COALESCE(tq.euro50 * 50, 0) + COALESCE(tq.euro20 * 20, 0) + COALESCE(tq.euro10 * 10, 0) +
  COALESCE(tq.euro5 * 5, 0) + COALESCE(tq.euro2 * 2, 0) + COALESCE(tq.euro1, 0) +
  COALESCE(tq.cents50 * 0.5, 0) + COALESCE(tq.cents20 * 0.2, 0) + COALESCE(tq.cents10 * 0.1, 0) +
  COALESCE(tq.cents5 * 0.05, 0) + COALESCE(tq.cents2 * 0.02, 0) + COALESCE(tq.cent1 * 0.01, 0) +
  COALESCE(tq.don_cheque, 0) + COALESCE(tq.don_creditcard, 0) as montant_total,
  tq.coins_money_bag_id,
  tq.bills_money_bag_id
FROM tronc_queteur tq
LEFT JOIN queteur q ON tq.queteur_id = q.id
LEFT JOIN point_quete pq ON tq.point_quete_id = pq.id
WHERE tq.deleted = 0
  AND tq.retour IS NOT NULL
EOSQL
)

# Escape SQL for JSON
DATASET_SQL_JSON=$(echo "$DATASET_SQL" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")

DATASET_RESULT=$(api_post "/api/v1/dataset/" "{
  \"database\": 1,
  \"schema\": \"rcq_fr_dev_db\",
  \"table_name\": \"comptage_tresorier\",
  \"sql\": ${DATASET_SQL_JSON}
}")

DATASET_ID=$(echo "$DATASET_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   ✅ Dataset created (ID: ${DATASET_ID})"

# ─── 2. Chart: Table ──────────────────────────────────────────────
echo "📋 Creating chart: Liste des Troncs..."

TABLE_CHART=$(api_post "/api/v1/chart/" "{
  \"datasource_id\": ${DATASET_ID},
  \"datasource_type\": \"table\",
  \"slice_name\": \"Comptage - Liste des Troncs\",
  \"viz_type\": \"table\",
  \"params\": \"{\\\"datasource\\\":\\\"${DATASET_ID}__table\\\",\\\"viz_type\\\":\\\"table\\\",\\\"query_mode\\\":\\\"raw\\\",\\\"all_columns\\\":[\\\"date_comptage\\\",\\\"queteur_name\\\",\\\"point_quete\\\",\\\"statut\\\",\\\"total_billets\\\",\\\"total_pieces\\\",\\\"total_cheques\\\",\\\"total_cb\\\",\\\"montant_total\\\",\\\"coins_money_bag_id\\\",\\\"bills_money_bag_id\\\"],\\\"order_by_cols\\\":[\\\"[\\\\\\\"datetime_comptage\\\\\\\",false]\\\"],\\\"row_limit\\\":100,\\\"page_length\\\":25,\\\"include_search\\\":true,\\\"table_timestamp_format\\\":\\\"smart_date\\\",\\\"color_pn\\\":true}\"
}")
TABLE_ID=$(echo "$TABLE_CHART" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   ✅ Table chart created (ID: ${TABLE_ID})"

# ─── 3. Chart: Big Number (Total du jour) ─────────────────────────
echo "🔢 Creating chart: Total du Jour..."

BIGNUMBER_CHART=$(api_post "/api/v1/chart/" "{
  \"datasource_id\": ${DATASET_ID},
  \"datasource_type\": \"table\",
  \"slice_name\": \"Comptage - Total du Jour\",
  \"viz_type\": \"big_number_total\",
  \"params\": \"{\\\"datasource\\\":\\\"${DATASET_ID}__table\\\",\\\"viz_type\\\":\\\"big_number_total\\\",\\\"metric\\\":{\\\"expressionType\\\":\\\"SQL\\\",\\\"sqlExpression\\\":\\\"SUM(montant_total)\\\",\\\"label\\\":\\\"Total €\\\"},\\\"adhoc_filters\\\":[{\\\"expressionType\\\":\\\"SQL\\\",\\\"sqlExpression\\\":\\\"date_comptage = CURDATE()\\\",\\\"clause\\\":\\\"WHERE\\\"}],\\\"header_font_size\\\":0.4,\\\"subheader_font_size\\\":0.15,\\\"y_axis_format\\\":\\\",.2f\\\"}\"
}")
BIGNUMBER_ID=$(echo "$BIGNUMBER_CHART" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   ✅ Big Number chart created (ID: ${BIGNUMBER_ID})"

# ─── 4. Chart: Pie (Répartition par quêteur) ──────────────────────
echo "🥧 Creating chart: Répartition par Quêteur..."

PIE_CHART=$(api_post "/api/v1/chart/" "{
  \"datasource_id\": ${DATASET_ID},
  \"datasource_type\": \"table\",
  \"slice_name\": \"Comptage - Répartition par Quêteur\",
  \"viz_type\": \"pie\",
  \"params\": \"{\\\"datasource\\\":\\\"${DATASET_ID}__table\\\",\\\"viz_type\\\":\\\"pie\\\",\\\"groupby\\\":[\\\"queteur_name\\\"],\\\"metric\\\":{\\\"expressionType\\\":\\\"SQL\\\",\\\"sqlExpression\\\":\\\"SUM(montant_total)\\\",\\\"label\\\":\\\"Total €\\\"},\\\"row_limit\\\":10,\\\"sort_by_metric\\\":true,\\\"color_scheme\\\":\\\"supersetColors\\\",\\\"show_labels\\\":true,\\\"show_legend\\\":true,\\\"label_type\\\":\\\"key_value_percent\\\",\\\"number_format\\\":\\\",.2f\\\"}\"
}")
PIE_ID=$(echo "$PIE_CHART" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   ✅ Pie chart created (ID: ${PIE_ID})"

# ─── 5. Dashboard ─────────────────────────────────────────────────
echo "📊 Creating dashboard: Comptage Trésorier..."

# Step 1: Create empty dashboard
DASH_RESULT=$(api_post "/api/v1/dashboard/" '{"dashboard_title": "Comptage Trésorier", "published": true}')
DASH_ID=$(echo "$DASH_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   ✅ Dashboard created (ID: ${DASH_ID})"

# Step 2: Build position_json and json_metadata with Python (proper escaping)
python3 -c "
import json
pos = json.dumps({
  'DASHBOARD_VERSION_KEY': 'v2',
  'GRID_ID': {'children': ['ROW-1','ROW-2'], 'id': 'GRID_ID', 'parents': ['ROOT_ID'], 'type': 'GRID'},
  'HEADER_ID': {'id': 'HEADER_ID', 'type': 'HEADER', 'meta': {'text': 'Comptage Trésorier'}},
  'ROOT_ID': {'children': ['GRID_ID'], 'id': 'ROOT_ID', 'type': 'ROOT'},
  'ROW-1': {'children': ['CHART-1','CHART-2'], 'id': 'ROW-1', 'meta': {'background': 'BACKGROUND_TRANSPARENT'}, 'parents': ['ROOT_ID','GRID_ID'], 'type': 'ROW'},
  'ROW-2': {'children': ['CHART-3'], 'id': 'ROW-2', 'meta': {'background': 'BACKGROUND_TRANSPARENT'}, 'parents': ['ROOT_ID','GRID_ID'], 'type': 'ROW'},
  'CHART-1': {'children': [], 'id': 'CHART-1', 'meta': {'chartId': ${BIGNUMBER_ID}, 'width': 4, 'height': 12, 'sliceName': 'Comptage - Total du Jour'}, 'parents': ['ROOT_ID','GRID_ID','ROW-1'], 'type': 'CHART'},
  'CHART-2': {'children': [], 'id': 'CHART-2', 'meta': {'chartId': ${PIE_ID}, 'width': 8, 'height': 12, 'sliceName': 'Comptage - Répartition par Quêteur'}, 'parents': ['ROOT_ID','GRID_ID','ROW-1'], 'type': 'CHART'},
  'CHART-3': {'children': [], 'id': 'CHART-3', 'meta': {'chartId': ${TABLE_ID}, 'width': 12, 'height': 16, 'sliceName': 'Comptage - Liste des Troncs'}, 'parents': ['ROOT_ID','GRID_ID','ROW-2'], 'type': 'CHART'}
})
meta = json.dumps({
  'native_filter_configuration': [{
    'id': 'NATIVE_FILTER-date',
    'controlValues': {'defaultToFirstItem': False, 'enableEmptyFilter': False},
    'name': 'Date de comptage',
    'filterType': 'filter_time',
    'targets': [{'datasetId': ${DATASET_ID}, 'column': {'name': 'date_comptage'}}],
    'defaultDataMask': {'filterState': {'value': 'Last week'}},
    'scope': {'rootPath': ['ROOT_ID'], 'excluded': []},
    'type': 'NATIVE_FILTER',
    'description': 'Filtrer par date de comptage',
    'chartsInScope': [${TABLE_ID}, ${BIGNUMBER_ID}, ${PIE_ID}]
  }],
  'color_scheme': 'supersetColors',
  'label_colors': {},
  'timed_refresh_immune_slices': [],
  'expanded_slices': {},
  'refresh_frequency': 0,
  'default_filters': '{}',
  'chart_configuration': {}
})
print(json.dumps({'position_json': pos, 'json_metadata': meta}))
" > /tmp/rcq_dash_payload.json

# Step 3: Update dashboard with layout and filters
api_put "/api/v1/dashboard/${DASH_ID}" "$(cat /tmp/rcq_dash_payload.json)" > /dev/null
rm -f /tmp/rcq_dash_payload.json
echo "   ✅ Dashboard layout and filters configured"

# Get UUID from dashboard detail
DASH_UUID=$(curl -sf "${SUPERSET_URL}/api/v1/dashboard/${DASH_ID}" -H "$AUTH" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['uuid'])")
echo "   📎 Dashboard UUID: ${DASH_UUID}"

echo ""
echo "════════════════════════════════════════════"
echo "✅ Dashboard 'Comptage Trésorier' created!"
echo "   URL:  ${SUPERSET_URL}/superset/dashboard/${DASH_ID}/"
echo "   UUID: ${DASH_UUID}"
echo "   Dataset ID: ${DATASET_ID}"
echo "   Charts: Table=${TABLE_ID}, BigNumber=${BIGNUMBER_ID}, Pie=${PIE_ID}"
echo "════════════════════════════════════════════"


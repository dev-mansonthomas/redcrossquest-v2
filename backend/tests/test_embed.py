"""Tests for Metabase embed endpoints."""
import pytest
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_get_embed_url_valid_dashboard():
    """Test /api/embed/{dashboard_key} with valid dashboard."""
    dashboard_key = "cumul-journalier"
    response = client.get(f"/api/embed/{dashboard_key}")
    assert response.status_code == 200
    data = response.json()
    assert "embed_url" in data
    assert "dashboard_key" in data
    assert data["dashboard_key"] == dashboard_key


def test_get_embed_url_invalid_dashboard():
    """Test /api/embed/{dashboard_key} with invalid dashboard."""
    response = client.get("/api/embed/invalid-dashboard")
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data


@pytest.mark.parametrize("dashboard_key", [
    "cumul-journalier",
    "kpi-annuels",
    "comptage-tresorier",
    "leaderboard"
])
def test_all_valid_dashboards(dashboard_key):
    """Test all valid dashboard keys return 200."""
    response = client.get(f"/api/embed/{dashboard_key}")
    assert response.status_code == 200


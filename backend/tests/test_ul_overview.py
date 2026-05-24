"""Tests for /api/ul/overview, focusing on aggregation by sector label.

Secteurs 1 and 2 both map to the "Bénévole" label. The endpoint must merge
those rows so the front-end does not lose one of them (collision on label).
"""
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.routers import auth
from src.routers import ul as ul_router


@pytest.fixture(autouse=True)
def configure_auth_settings(monkeypatch):
    monkeypatch.setattr(auth.settings, "jwt_secret_key", "test-jwt-secret", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_algorithm", "HS256", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_expire_minutes", 60, raising=False)


@pytest.fixture(autouse=True)
def disable_cache(monkeypatch):
    monkeypatch.setattr(ul_router, "cache_get", lambda key: None)
    monkeypatch.setattr(ul_router, "cache_set", lambda key, value, ttl_seconds=None: True)
    monkeypatch.setattr(ul_router, "cache_delete", lambda key: True)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_token():
    return auth.create_session_token({
        "email": "admin@croix-rouge.fr",
        "role": "4",
        "ul_id": 351,
    })


def _mock_user(monkeypatch, ul_id=351, role="4"):
    monkeypatch.setattr(
        ul_router,
        "get_authenticated_user",
        lambda request, db: {
            "email": "admin@croix-rouge.fr",
            "role": role,
            "ul_id": ul_id,
            "ul_name": "Paris 07",
            "role_name": "Admin",
        },
    )


def _make_db_mock(*, financials=None, hours=None, queteurs=None, activity=None):
    """Return a SQLAlchemy session mock whose .all() responses are routed by
    SQL fragment matching, mirroring the queries in ``ul_router``."""
    financials = financials or []
    hours = hours or []
    queteurs = queteurs or []
    activity = activity or []

    db = MagicMock()

    def execute(query, _params=None):
        q = str(query)
        result = MagicMock()
        if "total_billets" in q:
            result.mappings.return_value.all.return_value = financials
        elif "total_hours" in q:
            result.mappings.return_value.all.return_value = hours
        elif "nb_queteurs" in q:
            result.mappings.return_value.all.return_value = queteurs
        elif "nb_tronc_queteur" in q:
            result.mappings.return_value.all.return_value = activity
        else:
            result.mappings.return_value.all.return_value = []
        return result

    db.execute.side_effect = execute
    return db


def _override_db(db):
    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: db


def test_ul_overview_aggregates_queteurs_by_label(client, monkeypatch, auth_token):
    """Rows for secteur=1 (5 quêteurs) and secteur=2 (9) must collapse into
    a single "Bénévole" row totalling 14 — the prod bug from ul=351, 2026."""
    _mock_user(monkeypatch)
    db = _make_db_mock(queteurs=[
        {"year": 2026, "secteur": 1, "nb_queteurs": 5},
        {"year": 2026, "secteur": 2, "nb_queteurs": 9},
        {"year": 2026, "secteur": 3, "nb_queteurs": 4},
    ])
    _override_db(db)
    try:
        response = client.get(
            "/api/ul/overview",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        rows = response.json()["queteurs_by_sector"]
        benevole_2026 = [r for r in rows if r["year"] == 2026 and r["label"] == "Bénévole"]
        assert len(benevole_2026) == 1
        assert benevole_2026[0]["nb_queteurs"] == 14
        labels_2026 = sorted(r["label"] for r in rows if r["year"] == 2026)
        assert labels_2026 == ["Bénévole", "Bénévole d'un jour"]
    finally:
        app.dependency_overrides.clear()


def test_ul_overview_aggregates_hours_by_label(client, monkeypatch, auth_token):
    """Hours for secteurs 1 (10h) and 2 (5h) must sum to a single 15h row."""
    _mock_user(monkeypatch)
    db = _make_db_mock(hours=[
        {"year": 2026, "secteur": 1, "total_hours": 10.0},
        {"year": 2026, "secteur": 2, "total_hours": 5.0},
        {"year": 2026, "secteur": 4, "total_hours": 2.5},
    ])
    _override_db(db)
    try:
        response = client.get(
            "/api/ul/overview",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        rows = response.json()["hours_by_sector"]
        benevole_2026 = [r for r in rows if r["year"] == 2026 and r["label"] == "Bénévole"]
        assert len(benevole_2026) == 1
        assert benevole_2026[0]["total_hours"] == 15.0
        labels_2026 = sorted(r["label"] for r in rows if r["year"] == 2026)
        assert labels_2026 == ["Ancien bénévole", "Bénévole"]
    finally:
        app.dependency_overrides.clear()


def test_aggregate_by_label_helper_handles_unknown_secteur():
    """Unknown secteur values fall back to ``Secteur {n}`` and are not merged."""
    rows = [
        {"year": 2026, "secteur": 1, "nb_queteurs": 5},
        {"year": 2026, "secteur": 2, "nb_queteurs": 9},
        {"year": 2026, "secteur": 99, "nb_queteurs": 1},
    ]
    out = ul_router._aggregate_by_label(rows, "nb_queteurs", int)
    by_label = {r["label"]: r for r in out}
    assert by_label["Bénévole"]["nb_queteurs"] == 14
    assert by_label["Bénévole"]["secteur"] == 1
    assert by_label["Secteur 99"]["nb_queteurs"] == 1

"""Tests for /api/yearly-goals endpoint, including the dynamic-start-date fallback."""
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.routers import auth, yearly_goals as yg_router


@pytest.fixture(autouse=True)
def configure_auth_settings(monkeypatch):
    monkeypatch.setattr(auth.settings, "jwt_secret_key", "test-jwt-secret", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_algorithm", "HS256", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_expire_minutes", 60, raising=False)


@pytest.fixture(autouse=True)
def disable_cache(monkeypatch):
    monkeypatch.setattr(yg_router, "cache_get", lambda key: None)
    monkeypatch.setattr(yg_router, "cache_set", lambda key, value, ttl_seconds=None: True)
    monkeypatch.setattr(yg_router, "cache_delete", lambda key: True)


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
        yg_router,
        "get_authenticated_user",
        lambda request, db: {
            "email": "admin@croix-rouge.fr",
            "role": role,
            "ul_id": ul_id,
            "ul_name": "Paris 07",
            "role_name": "Admin",
        },
    )


def _make_db_mock(realise_rows_per_call, objectif_row=None,
                  min_depart_row=None):
    """Build a SQLAlchemy session mock that returns the given rows in order.

    realise_rows_per_call is an iterable of row-lists, one per .all() call.
    objectif_row / min_depart_row feed .first() calls.
    """
    db = MagicMock()
    all_iter = iter(realise_rows_per_call)
    first_iter = iter([min_depart_row, objectif_row])

    def execute(_query, _params=None):
        result = MagicMock()
        result.mappings.return_value.all.side_effect = lambda: next(all_iter, [])
        result.mappings.return_value.first.side_effect = lambda: next(first_iter, None)
        return result

    db.execute.side_effect = execute
    return db


# ─── Flag OFF (default / prod) ────────────────────────────────────────────────


def test_yearly_goals_requires_auth(client):
    response = client.get("/api/yearly-goals")
    assert response.status_code == 401


def test_yearly_goals_flag_off_uses_official_window(client, monkeypatch, auth_token):
    """With the flag OFF, the router must call REALISE_QUERY only — never the
    dynamic fallback — even when a year returns 0 rows. This locks down prod
    behavior."""
    monkeypatch.setattr(yg_router.settings, "yearly_goals_dynamic_start_date", False, raising=False)
    _mock_user(monkeypatch)

    # 6 years × 0 rows + objectif None → 6 .all() calls, 1 .first() call.
    db = _make_db_mock(realise_rows_per_call=[[], [], [], [], [], []], objectif_row=None)

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: db
    try:
        response = client.get(
            "/api/yearly-goals",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        assert response.json() == {"data": []}

        # Verify no call ever used the dynamic query.
        executed_queries = [str(call.args[0]) for call in db.execute.call_args_list]
        assert all(":start_date" not in q for q in executed_queries), (
            "REALISE_QUERY_DYNAMIC must not be used when flag is OFF"
        )
        assert all("MIN(d) AS min_depart" not in q for q in executed_queries), (
            "MIN_DEPART_QUERY must not be used when flag is OFF"
        )
    finally:
        app.dependency_overrides.clear()


# ─── Flag ON (dev/test fallback) ──────────────────────────────────────────────


def test_yearly_goals_flag_on_falls_back_when_window_empty(client, monkeypatch, auth_token):
    """With the flag ON and a year returning 0 rows from the official query,
    the router must compute MIN(depart) and re-run the dynamic query."""
    monkeypatch.setattr(yg_router.settings, "yearly_goals_dynamic_start_date", True, raising=False)
    _mock_user(monkeypatch)

    fallback_rows = [
        {"ul_id": 351, "year": 2026, "jour_num": 1, "serie": "Réalisé",
         "montant_cumule": 445.75},
    ]
    # Per-year .all() pattern: 5 official empty + 1 official empty (current) +
    # 1 dynamic call returning fallback_rows. The MagicMock will return [] for
    # all official calls and fallback_rows when the dynamic query is executed.
    db = MagicMock()
    call_count = {"all": 0, "first": 0}

    def execute(query, _params=None):
        q = str(query)
        result = MagicMock()
        if ":start_date" in q:
            result.mappings.return_value.all.return_value = fallback_rows
        elif "MIN(d) AS min_depart" in q:
            result.mappings.return_value.first.return_value = {"min_depart": "2026-04-16"}
        else:
            result.mappings.return_value.all.return_value = []
            result.mappings.return_value.first.return_value = None
        return result

    db.execute.side_effect = execute

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: db
    try:
        response = client.get(
            "/api/yearly-goals",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert any(p["year"] == 2026 and p["serie"] == "Réalisé"
                   and p["montant_cumule"] == 445.75 for p in data)
    finally:
        app.dependency_overrides.clear()

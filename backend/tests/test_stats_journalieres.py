"""Tests for /api/stats-journalieres — daily breakdown + cache behavior."""
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.routers import auth, stats_journalieres as sj_router


@pytest.fixture(autouse=True)
def configure_auth_settings(monkeypatch):
    monkeypatch.setattr(auth.settings, "jwt_secret_key", "test-jwt-secret", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_algorithm", "HS256", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_expire_minutes", 60, raising=False)


@pytest.fixture
def cache_store(monkeypatch):
    """In-memory cache substitute so we can observe hits/misses."""
    store: dict = {}
    monkeypatch.setattr(sj_router, "cache_get", lambda key: store.get(key))
    monkeypatch.setattr(
        sj_router,
        "cache_set",
        lambda key, value, ttl_seconds=None: store.__setitem__(key, value) or True,
    )
    monkeypatch.setattr(sj_router, "cache_delete", lambda key: store.pop(key, None) or True)
    return store


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
        sj_router,
        "get_authenticated_user",
        lambda request, db: {
            "email": "admin@croix-rouge.fr",
            "role": role,
            "ul_id": ul_id,
            "ul_name": "Paris 07",
            "role_name": "Admin",
        },
    )


def _make_db_mock(stats_rows=None, year_rows=None):
    stats_rows = stats_rows or []
    year_rows = year_rows or []
    db = MagicMock()

    def execute(query, _params=None):
        q = str(query)
        result = MagicMock()
        if "jour_num" in q:
            result.mappings.return_value.all.return_value = stats_rows
        else:
            result.mappings.return_value.all.return_value = year_rows
        return result

    db.execute.side_effect = execute
    return db


def _override_db(db):
    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: db


SAMPLE_ROW = {
    "jour_num": 1,
    "montant_jour": 1000.0,
    "montant_pieces": 100.0,
    "montant_billets": 700.0,
    "montant_cheque": 50.0,
    "montant_cb": 150.0,
    "nb_benevoles": 12,
    "nb_benevoles_1j": 3,
    "nb_heures": 24.5,
}


def test_requires_auth(client):
    response = client.get("/api/stats-journalieres")
    assert response.status_code == 401


def test_forbidden_for_low_role(client, monkeypatch, cache_store, auth_token):
    _mock_user(monkeypatch, role="1")  # LECTURE_SEUL
    _override_db(_make_db_mock())
    try:
        response = client.get(
            "/api/stats-journalieres",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_returns_full_breakdown(client, monkeypatch, cache_store, auth_token):
    _mock_user(monkeypatch)
    _override_db(_make_db_mock(stats_rows=[SAMPLE_ROW], year_rows=[{"year": 2026}]))
    try:
        response = client.get(
            "/api/stats-journalieres?year=2026",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["year"] == 2026
        assert 2026 in body["available_years"]
        assert len(body["data"]) == 1
        row = body["data"][0]
        for field in (
            "montant_jour", "montant_pieces", "montant_billets",
            "montant_cheque", "montant_cb", "nb_benevoles",
            "nb_benevoles_1j", "nb_heures",
        ):
            assert field in row
        breakdown_sum = (
            row["montant_pieces"] + row["montant_billets"]
            + row["montant_cheque"] + row["montant_cb"]
        )
        assert abs(breakdown_sum - row["montant_jour"]) < 0.01
    finally:
        app.dependency_overrides.clear()


def test_cache_hit_skips_db(client, monkeypatch, cache_store, auth_token):
    _mock_user(monkeypatch)
    db = _make_db_mock(stats_rows=[SAMPLE_ROW], year_rows=[{"year": 2026}])
    _override_db(db)
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        r1 = client.get("/api/stats-journalieres?year=2026", headers=headers)
        assert r1.status_code == 200
        first_call_count = db.execute.call_count
        assert first_call_count > 0
        # 2nd call must hit the cache (v2 key) and not touch the DB
        r2 = client.get("/api/stats-journalieres?year=2026", headers=headers)
        assert r2.status_code == 200
        assert db.execute.call_count == first_call_count
        assert any("stats_journalieres:v2:" in k for k in cache_store.keys())
    finally:
        app.dependency_overrides.clear()


def test_refresh_invalidates_cache(client, monkeypatch, cache_store, auth_token):
    _mock_user(monkeypatch)
    db = _make_db_mock(stats_rows=[SAMPLE_ROW], year_rows=[{"year": 2026}])
    _override_db(db)
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        client.get("/api/stats-journalieres?year=2026", headers=headers)
        before = db.execute.call_count
        # refresh=true must drop the cache and re-query
        r = client.get("/api/stats-journalieres?year=2026&refresh=true", headers=headers)
        assert r.status_code == 200
        assert db.execute.call_count > before
    finally:
        app.dependency_overrides.clear()

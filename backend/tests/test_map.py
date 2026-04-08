"""Tests for map endpoints."""
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.routers import auth, map as map_router


@pytest.fixture(autouse=True)
def configure_auth_settings(monkeypatch):
    """Set deterministic auth settings for unit tests."""
    monkeypatch.setattr(auth.settings, "jwt_secret_key", "test-jwt-secret", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_algorithm", "HS256", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_expire_minutes", 60, raising=False)


@pytest.fixture
def client():
    """Return a fresh test client for each test."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_token():
    """Create a valid JWT token for testing."""
    return auth.create_session_token({
        "email": "user@croix-rouge.fr",
        "role": "2",
        "ul_id": 123,
    })


def _mock_authenticated_user(monkeypatch, ul_id=123):
    """Mock get_authenticated_user to return a user with the given ul_id."""
    monkeypatch.setattr(
        map_router,
        "get_authenticated_user",
        lambda request, db: {
            "email": "user@croix-rouge.fr",
            "role": "2",
            "ul_id": ul_id,
            "ul_name": "Paris 15",
            "role_name": "Opérateur",
        },
    )


def test_active_queteurs_requires_auth(client):
    """GET /api/map/active-queteurs without auth should return 401."""
    response = client.get("/api/map/active-queteurs")
    assert response.status_code == 401


def test_active_queteurs_returns_empty_list(client, monkeypatch, auth_token):
    """GET /api/map/active-queteurs should return empty list when no quêteurs are active."""
    _mock_authenticated_user(monkeypatch)

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = []
    monkeypatch.setattr(map_router, "get_rcq_db", lambda: iter([mock_db]))

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/map/active-queteurs",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        assert response.json() == {"queteurs": []}
    finally:
        app.dependency_overrides.clear()


def test_active_queteurs_returns_data(client, monkeypatch, auth_token):
    """GET /api/map/active-queteurs should return active quêteur data."""
    _mock_authenticated_user(monkeypatch)

    depart_time = datetime(2026, 4, 8, 9, 0, 0)
    mock_rows = [
        {
            "first_name": "Jean",
            "last_name": "Dupont",
            "man": True,
            "latitude": 48.8566,
            "longitude": 2.3522,
            "point_name": "Mairie",
            "address": "1 rue de la Mairie",
            "depart": depart_time,
            "point_quete_id": 1,
        },
        {
            "first_name": "Marie",
            "last_name": "Martin",
            "man": False,
            "latitude": 48.8600,
            "longitude": 2.3400,
            "point_name": "Gare",
            "address": "10 place de la Gare",
            "depart": depart_time,
            "point_quete_id": 2,
        },
    ]

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = mock_rows

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/map/active-queteurs",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["queteurs"]) == 2
        assert data["queteurs"][0]["first_name"] == "Jean"
        assert data["queteurs"][0]["latitude"] == 48.8566
        assert data["queteurs"][1]["first_name"] == "Marie"
        assert data["queteurs"][1]["point_name"] == "Gare"
    finally:
        app.dependency_overrides.clear()


def test_active_queteurs_filters_by_ul_id(client, monkeypatch, auth_token):
    """The SQL query should use the authenticated user's ul_id."""
    _mock_authenticated_user(monkeypatch, ul_id=456)

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = []

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/map/active-queteurs",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200

        # Verify the SQL was called with the correct ul_id
        call_args = mock_db.execute.call_args
        params = call_args[0][1] if len(call_args[0]) > 1 else call_args[1].get("params", {})
        assert params["ul_id"] == 456
    finally:
        app.dependency_overrides.clear()


# ─── Points de quête tests ───────────────────────────────────────────


def test_points_quete_requires_auth(client):
    """GET /api/map/points-quete without auth should return 401."""
    response = client.get("/api/map/points-quete")
    assert response.status_code == 401


def test_points_quete_returns_empty_list(client, monkeypatch, auth_token):
    """GET /api/map/points-quete should return empty list when no points exist."""
    _mock_authenticated_user(monkeypatch)

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = []

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/map/points-quete",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        assert response.json() == {"points_quete": []}
    finally:
        app.dependency_overrides.clear()


def test_points_quete_returns_data(client, monkeypatch, auth_token):
    """GET /api/map/points-quete should return point de quête data."""
    _mock_authenticated_user(monkeypatch)

    mock_rows = [
        {
            "id": 1,
            "name": "Mairie",
            "latitude": 48.8566,
            "longitude": 2.3522,
            "address": "1 rue de la Mairie",
        },
        {
            "id": 2,
            "name": "Gare",
            "latitude": 48.8600,
            "longitude": 2.3400,
            "address": "10 place de la Gare",
        },
    ]

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = mock_rows

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/map/points-quete",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["points_quete"]) == 2
        assert data["points_quete"][0]["name"] == "Mairie"
        assert data["points_quete"][0]["latitude"] == 48.8566
        assert data["points_quete"][1]["name"] == "Gare"
        assert data["points_quete"][1]["id"] == 2
    finally:
        app.dependency_overrides.clear()


def test_points_quete_filters_by_ul_id(client, monkeypatch, auth_token):
    """The SQL query should use the authenticated user's ul_id."""
    _mock_authenticated_user(monkeypatch, ul_id=789)

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = []

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/map/points-quete",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200

        # Verify the SQL was called with the correct ul_id
        call_args = mock_db.execute.call_args
        params = call_args[0][1] if len(call_args[0]) > 1 else call_args[1].get("params", {})
        assert params["ul_id"] == 789
    finally:
        app.dependency_overrides.clear()

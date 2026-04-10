"""Tests for classement-global endpoints."""
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.routers import auth, classement as cl_router


@pytest.fixture(autouse=True)
def configure_auth_settings(monkeypatch):
    """Set deterministic auth settings for unit tests."""
    monkeypatch.setattr(auth.settings, "jwt_secret_key", "test-jwt-secret", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_algorithm", "HS256", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_expire_minutes", 60, raising=False)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_token():
    return auth.create_session_token({
        "email": "admin@croix-rouge.fr",
        "role": "4",
        "ul_id": 100,
    })


def _mock_admin_user(monkeypatch, ul_id=100, role="4"):
    monkeypatch.setattr(
        cl_router,
        "get_authenticated_user",
        lambda request, db: {
            "email": "admin@croix-rouge.fr",
            "role": role,
            "ul_id": ul_id,
            "ul_name": "Paris 15",
            "role_name": "Admin",
        },
    )


# ─── GET /api/classement-global ───────────────────────────────────────────


def test_classement_requires_auth(client):
    response = client.get("/api/classement-global?year=2025")
    assert response.status_code == 401


def test_classement_forbidden_for_non_admin(client, monkeypatch, auth_token):
    _mock_admin_user(monkeypatch, role="2")

    mock_db = MagicMock()
    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/classement-global?year=2025",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_classement_returns_data(client, monkeypatch, auth_token):
    _mock_admin_user(monkeypatch)

    mock_rows = [
        {
            "queteur_id": 1,
            "first_name": "Jean",
            "last_name": "Dupont",
            "total_euro": 150.50,
            "total_hours": 5.25,
            "nb_sorties": 3,
            "total_weight_kg": 2.10,
            "efficiency_euro_per_hour": 28.67,
        },
        {
            "queteur_id": 2,
            "first_name": "Marie",
            "last_name": "Martin",
            "total_euro": 120.00,
            "total_hours": 4.00,
            "nb_sorties": 2,
            "total_weight_kg": 1.80,
            "efficiency_euro_per_hour": 30.00,
        },
    ]

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = mock_rows

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/classement-global?year=2025",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["queteurs"]) == 2
        assert data["queteurs"][0]["first_name"] == "Jean"
        assert data["queteurs"][0]["total_euro"] == 150.50
        assert data["queteurs"][1]["queteur_id"] == 2
    finally:
        app.dependency_overrides.clear()


def test_classement_role_9_allowed(client, monkeypatch, auth_token):
    _mock_admin_user(monkeypatch, role="9")

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = []

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/classement-global?year=2025",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        assert response.json() == {"queteurs": []}
    finally:
        app.dependency_overrides.clear()


# ─── GET /api/classement-global/{queteur_id}/troncs ────────────────────────


def test_troncs_requires_auth(client):
    response = client.get("/api/classement-global/1/troncs?year=2025")
    assert response.status_code == 401


def test_troncs_forbidden_for_non_admin(client, monkeypatch, auth_token):
    _mock_admin_user(monkeypatch, role="2")

    mock_db = MagicMock()
    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/classement-global/1/troncs?year=2025",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_troncs_returns_data(client, monkeypatch, auth_token):
    _mock_admin_user(monkeypatch)

    mock_rows = [
        {
            "tronc_queteur_id": 10,
            "total_euro": 45.20,
            "hours": 2.50,
            "weight_kg": 0.80,
            "point_quete_name": "Mairie",
        },
        {
            "tronc_queteur_id": 11,
            "total_euro": 30.00,
            "hours": 1.75,
            "weight_kg": 0.50,
            "point_quete_name": "Gare",
        },
    ]

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = mock_rows

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/classement-global/1/troncs?year=2025",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["troncs"]) == 2
        assert data["troncs"][0]["tronc_queteur_id"] == 10
        assert data["troncs"][0]["point_quete_name"] == "Mairie"
        assert data["troncs"][1]["total_euro"] == 30.00
    finally:
        app.dependency_overrides.clear()


def test_troncs_filters_by_ul_id_and_queteur(client, monkeypatch, auth_token):
    _mock_admin_user(monkeypatch, ul_id=456)

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = []

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/classement-global/42/troncs?year=2025",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200

        call_args = mock_db.execute.call_args
        params = call_args[0][1] if len(call_args[0]) > 1 else call_args[1].get("params", {})
        assert params["ul_id"] == 456
        assert params["queteur_id"] == 42
        assert params["year"] == 2025
    finally:
        app.dependency_overrides.clear()


# ─── Secteur filter ──────────────────────────────────────────────────────────


def test_classement_with_secteur_benevole(client, monkeypatch, auth_token):
    _mock_admin_user(monkeypatch)

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = []

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/classement-global?year=2025&secteur=benevole",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200

        call_args = mock_db.execute.call_args
        params = call_args[0][1] if len(call_args[0]) > 1 else call_args[1].get("params", {})
        assert params["sv0"] == 1
        assert params["sv1"] == 2
    finally:
        app.dependency_overrides.clear()


def test_classement_with_secteur_commercant(client, monkeypatch, auth_token):
    _mock_admin_user(monkeypatch)

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = []

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/classement-global?year=2025&secteur=commercant",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200

        call_args = mock_db.execute.call_args
        params = call_args[0][1] if len(call_args[0]) > 1 else call_args[1].get("params", {})
        assert params["secteur_val"] == 5
    finally:
        app.dependency_overrides.clear()

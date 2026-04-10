"""Tests for classement-tronc endpoints."""
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.routers import auth, classement_tronc as ct_router


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
        ct_router,
        "get_authenticated_user",
        lambda request, db: {
            "email": "admin@croix-rouge.fr",
            "role": role,
            "ul_id": ul_id,
            "ul_name": "Paris 15",
            "role_name": "Admin",
        },
    )


# ─── GET /api/classement-tronc ─────────────────────────────────────────


def test_classement_tronc_requires_auth(client):
    response = client.get("/api/classement-tronc?year=2025")
    assert response.status_code == 401


def test_classement_tronc_forbidden_for_non_admin(client, monkeypatch, auth_token):
    _mock_admin_user(monkeypatch, role="2")

    mock_db = MagicMock()
    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/classement-tronc?year=2025",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_classement_tronc_returns_data(client, monkeypatch, auth_token):
    _mock_admin_user(monkeypatch)

    mock_rows = [
        {
            "queteur_id": 1,
            "first_name": "Jean",
            "last_name": "Dupont",
            "secteur": 1,
            "best_montant": 150.50,
            "best_poids_kg": 2.10,
            "best_duree_h": 5.25,
            "best_taux_horaire": 28.67,
        },
        {
            "queteur_id": 2,
            "first_name": "Marie",
            "last_name": "Martin",
            "secteur": 2,
            "best_montant": 120.00,
            "best_poids_kg": 1.80,
            "best_duree_h": 4.00,
            "best_taux_horaire": 30.00,
        },
    ]

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = mock_rows

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/classement-tronc?year=2025",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["queteurs"]) == 2
        assert data["queteurs"][0]["queteur_id"] == 1
        assert data["queteurs"][0]["first_name"] == "Jean"
        assert data["queteurs"][0]["best_montant"] == 150.50
        assert data["queteurs"][0]["best_poids_kg"] == 2.10
        assert data["queteurs"][0]["best_duree_h"] == 5.25
        assert data["queteurs"][0]["best_taux_horaire"] == 28.67
        assert data["queteurs"][1]["queteur_id"] == 2
    finally:
        app.dependency_overrides.clear()


def test_classement_tronc_role_9_allowed(client, monkeypatch, auth_token):
    _mock_admin_user(monkeypatch, role="9")

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = []

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/classement-tronc?year=2025",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        assert response.json() == {"queteurs": []}
    finally:
        app.dependency_overrides.clear()


# ─── GET /api/classement-tronc/{queteur_id}/troncs-champions ──────────


def test_champions_requires_auth(client):
    response = client.get("/api/classement-tronc/1/troncs-champions?year=2025")
    assert response.status_code == 401


def test_champions_forbidden_for_non_admin(client, monkeypatch, auth_token):
    _mock_admin_user(monkeypatch, role="2")

    mock_db = MagicMock()
    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/classement-tronc/1/troncs-champions?year=2025",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_champions_returns_grouped_data(client, monkeypatch, auth_token):
    """If the same tronc wins multiple metrics, it should appear once with combined champion_types."""
    _mock_admin_user(monkeypatch)

    # Simulate: tronc 10 is best for montant AND poids, tronc 11 is best for duree
    champion_rows = {
        "montant": [{"tronc_queteur_id": 10, "point_quete_name": "Mairie", "total_euro": 150.0, "hours": 5.0, "weight_kg": 2.0, "champion_type": "montant"}],
        "poids": [{"tronc_queteur_id": 10, "point_quete_name": "Mairie", "total_euro": 150.0, "hours": 5.0, "weight_kg": 2.0, "champion_type": "poids"}],
        "duree": [{"tronc_queteur_id": 11, "point_quete_name": "Gare", "total_euro": 80.0, "hours": 8.0, "weight_kg": 1.0, "champion_type": "duree"}],
    }

    call_count = {"n": 0}
    metrics_order = ["montant", "poids", "duree"]

    mock_db = MagicMock()

    def side_effect_execute(query, params):
        result = MagicMock()
        metric = metrics_order[call_count["n"]]
        call_count["n"] += 1
        result.mappings.return_value.all.return_value = champion_rows[metric]
        return result

    mock_db.execute = side_effect_execute

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/classement-tronc/1/troncs-champions?year=2025",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        troncs = data["troncs"]
        assert len(troncs) == 2  # tronc 10 grouped, tronc 11 separate

        # Find the grouped tronc
        tronc_10 = next(t for t in troncs if t["tronc_queteur_id"] == 10)
        assert sorted(tronc_10["champion_types"]) == ["montant", "poids"]

        tronc_11 = next(t for t in troncs if t["tronc_queteur_id"] == 11)
        assert tronc_11["champion_types"] == ["duree"]
    finally:
        app.dependency_overrides.clear()


def test_champions_empty_result(client, monkeypatch, auth_token):
    _mock_admin_user(monkeypatch)

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = []

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/classement-tronc/999/troncs-champions?year=2025",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        assert response.json() == {"troncs": []}
    finally:
        app.dependency_overrides.clear()


# ─── Secteur filter ──────────────────────────────────────────────────────


def test_classement_tronc_with_secteur_benevole(client, monkeypatch, auth_token):
    _mock_admin_user(monkeypatch)

    mock_db = MagicMock()
    mock_db.execute.return_value.mappings.return_value.all.return_value = []

    from src.database import get_rcq_db
    app.dependency_overrides[get_rcq_db] = lambda: mock_db

    try:
        response = client.get(
            "/api/classement-tronc?year=2025&secteur=benevole",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200

        call_args = mock_db.execute.call_args
        params = call_args[0][1] if len(call_args[0]) > 1 else call_args[1].get("params", {})
        assert params["sv0"] == 1
        assert params["sv1"] == 2
    finally:
        app.dependency_overrides.clear()

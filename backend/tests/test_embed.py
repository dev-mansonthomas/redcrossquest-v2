"""Tests for Superset embed endpoints."""
import pytest
import jwt
from fastapi.testclient import TestClient

from src.main import app
from src.routers import auth as auth_router
from src.routers import embed as embed_router

client = TestClient(app)
SUPERSET_TEST_SIGNING_KEY = ("superset-test-key-" * 2) + "1234"  # pragma: allowlist secret
SESSION_TEST_SIGNING_KEY = ("session-test-key-" * 2) + "12345"  # pragma: allowlist secret
TEST_USER_PROFILES: dict[str, dict[str, object]] = {}


@pytest.fixture(autouse=True)
def configure_embed_settings(monkeypatch):
    """Configure JWT secrets for embed tests."""
    monkeypatch.setattr(embed_router.settings, "superset_admin_password", SUPERSET_TEST_SIGNING_KEY)
    monkeypatch.setattr(embed_router.settings, "superset_url", "https://superset.rcq.fr")
    monkeypatch.setattr(embed_router.settings, "jwt_secret_key", SESSION_TEST_SIGNING_KEY)
    TEST_USER_PROFILES.clear()

    def fake_get_user_profile_by_email(_db, email):
        return TEST_USER_PROFILES.get(email.lower())

    monkeypatch.setattr(auth_router, "get_user_profile_by_email", fake_get_user_profile_by_email)


def make_session_token(**overrides):
    """Create a valid session JWT for test requests."""
    email = overrides.pop("email", "test@redcross.fr")
    payload = {
        "email": email,
        "role": "2",
        "ul_id": 123,
    }
    payload.update(overrides)
    TEST_USER_PROFILES[email.lower()] = {
        "email": email,
        "role": str(payload["role"]),
        "ul_id": payload["ul_id"],
    }
    return jwt.encode(payload, SESSION_TEST_SIGNING_KEY, algorithm="HS256")


def auth_headers(**overrides):
    """Build Authorization headers for requests."""
    token = make_session_token(**overrides)
    return {"Authorization": f"Bearer {token}"}


def test_get_embed_url_locks_ul_id_from_session():
    """ul_id must come from the session, not from query params."""
    response = client.get(
        "/api/embed/kpi_yearly?year=2026&ul_id=999",
        headers=auth_headers(role="2", ul_id=123),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["embed_url"].startswith("https://superset.rcq.fr/embed/dashboard/")

    embed_token = data["embed_url"].rsplit("/", maxsplit=1)[-1]
    payload = jwt.decode(embed_token, SUPERSET_TEST_SIGNING_KEY, algorithms=["HS256"])

    assert payload["resource"]["dashboard"]  # UUID string from config
    assert payload["params"]["year"] == "2026"
    assert payload["params"]["ul_id"] == 123


def test_get_embed_url_requires_authentication():
    """A session token is required to access embed URLs."""
    response = client.get("/api/embed/kpi_yearly")
    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required"


def test_get_embed_url_rejects_unauthorized_role():
    """Users without the required role cannot access restricted dashboards."""
    response = client.get(
        "/api/embed/goal_progress",
        headers=auth_headers(role="3", ul_id=123),
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Dashboard access forbidden"


def test_get_embed_url_invalid_dashboard():
    """Unknown dashboard keys must return 404."""
    response = client.get(
        "/api/embed/invalid-dashboard",
        headers=auth_headers(role="2", ul_id=123),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Dashboard not found"

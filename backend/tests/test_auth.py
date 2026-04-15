"""Tests for authentication endpoints."""
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.routers import auth


@pytest.fixture(autouse=True)
def configure_auth_settings(monkeypatch):
    """Set deterministic auth settings for unit tests."""
    monkeypatch.setattr(auth.settings, "google_oauth_client_id", "google-client-id", raising=False)
    monkeypatch.setattr(auth.settings, "google_oauth_client_secret", "google-client-secret", raising=False)
    monkeypatch.setattr(auth.settings, "google_redirect_uri", "http://testserver/api/auth/callback", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_secret_key", "test-jwt-secret", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_algorithm", "HS256", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_expire_minutes", 60, raising=False)
    monkeypatch.setattr(auth.settings, "environment", "dev", raising=False)


@pytest.fixture
def client():
    """Return a fresh test client for each test."""
    with TestClient(app) as test_client:
        yield test_client


def test_login_redirects_to_google(client):
    """`/api/auth/login/google` should redirect to the Google OAuth consent screen."""
    response = client.get("/api/auth/login/google", follow_redirects=False)

    assert response.status_code == 307
    assert auth.OAUTH_STATE_COOKIE_NAME in response.cookies

    redirect_url = urlparse(response.headers["location"])
    query = parse_qs(redirect_url.query)

    assert redirect_url.scheme == "https"
    assert redirect_url.netloc == "accounts.google.com"
    assert query["client_id"] == ["google-client-id"]
    assert query["redirect_uri"] == ["http://testserver/api/auth/callback"]
    assert query["response_type"] == ["code"]
    assert query["scope"] == ["openid email profile"]
    assert query["hd"] == ["croix-rouge.fr"]
    assert query["state"][0]


def test_auth_callback_creates_session_cookie(client, monkeypatch):
    """`/api/auth/callback` should exchange the code and create a session cookie."""
    client.cookies.set(auth.OAUTH_STATE_COOKIE_NAME, "expected-state")
    monkeypatch.setattr(auth, "exchange_code_for_tokens", lambda code: {"access_token": "google-access-token"})
    monkeypatch.setattr(
        auth,
        "fetch_google_userinfo",
        lambda access_token: {"email": "admin@croix-rouge.fr", "email_verified": True},
    )
    monkeypatch.setattr(
        auth,
        "get_user_profile_by_email",
        lambda db, email: {
            "email": email,
            "role": "2",
            "ul_id": 123,
            "ul_name": "Paris 15",
            "role_name": "Opérateur",
        },
    )

    response = client.get("/api/auth/callback?code=oauth-code&state=expected-state", follow_redirects=False)

    assert response.status_code == 302
    # Token should NOT be in the redirect URL (security: httpOnly cookie only)
    assert "token=" not in response.headers["location"]
    assert response.headers["location"].endswith("/auth/callback")
    assert response.cookies.get(auth.SESSION_COOKIE_NAME)


@pytest.mark.parametrize(
    ("role", "ul_id", "ul_name"),
    [
        ("1", None, None),
        ("2", 123, "Paris 15"),
        ("3", 456, "Lyon 3"),
        ("4", 789, "Marseille 8"),
    ],
)
def test_get_me_returns_authenticated_user(client, monkeypatch, role, ul_id, ul_name):
    """`/api/me` should return the authenticated user for every RCQ role."""
    role_name = auth.ROLE_NAMES.get(role, "")
    monkeypatch.setattr(
        auth,
        "get_user_profile_by_email",
        lambda db, email: {
            "email": email,
            "role": role,
            "ul_id": ul_id,
            "ul_name": ul_name,
            "role_name": role_name,
        },
    )
    session_token = auth.create_session_token(
        {
            "email": "user@croix-rouge.fr",
            "role": role,
            "ul_id": ul_id,
        }
    )

    response = client.get(
        "/api/me",
        headers={"Authorization": f"Bearer {session_token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "email": "user@croix-rouge.fr",
        "role": role,
        "ul_id": ul_id,
        "ul_name": ul_name,
        "role_name": role_name,
        "real_role": None,
    }

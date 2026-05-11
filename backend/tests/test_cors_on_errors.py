"""Tests that CORS and security headers are present on error responses.

Regression test: previously, an unhandled exception raised by a route caused
Starlette's built-in ServerErrorMiddleware to send a plain 500 response
directly, bypassing the user middleware stack. As a result the browser saw a
misleading "CORS error" instead of the real backend failure. The fix catches
exceptions inside SecurityHeadersMiddleware and converts them into a 500
JSONResponse that flows back through CORSMiddleware.
"""
from fastapi import APIRouter, HTTPException
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app

# Register routes that trigger error responses (only once at import time).
_test_router = APIRouter()


@_test_router.get("/__test_unhandled_exc__")
async def _raise_unhandled():
    raise RuntimeError("boom")


@_test_router.get("/__test_http_exc__")
async def _raise_http():
    raise HTTPException(status_code=404, detail="not found")


app.include_router(_test_router)

# raise_server_exceptions=False makes TestClient return the 500 response
# instead of re-raising the exception (mirrors real ASGI server behaviour).
client = TestClient(app, raise_server_exceptions=False)

ALLOWED_ORIGIN = settings.cors_origins[0]


def test_unhandled_exception_returns_500_with_cors_header():
    """An unhandled exception must produce a 500 with CORS headers attached."""
    response = client.get(
        "/__test_unhandled_exc__",
        headers={"Origin": ALLOWED_ORIGIN},
    )
    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_unhandled_exception_returns_500_with_security_headers():
    """Security headers must also be present on 500 responses (non-regression)."""
    response = client.get(
        "/__test_unhandled_exc__",
        headers={"Origin": ALLOWED_ORIGIN},
    )
    assert response.status_code == 500
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert "content-security-policy" in response.headers


def test_unhandled_exception_returns_json_body():
    """The 500 body must be JSON (so frontend can parse it consistently)."""
    response = client.get(
        "/__test_unhandled_exc__",
        headers={"Origin": ALLOWED_ORIGIN},
    )
    assert response.status_code == 500
    assert response.headers.get("content-type", "").startswith("application/json")
    assert response.json() == {"detail": "Internal Server Error"}


def test_http_exception_keeps_cors_and_security_headers():
    """HTTPException responses (4xx) must also carry CORS + security headers."""
    response = client.get(
        "/__test_http_exc__",
        headers={"Origin": ALLOWED_ORIGIN},
    )
    assert response.status_code == 404
    assert response.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN
    assert response.headers.get("x-content-type-options") == "nosniff"


def test_success_response_keeps_security_and_cors_headers():
    """Non-regression: 2xx responses still have security and CORS headers."""
    response = client.get("/health", headers={"Origin": ALLOWED_ORIGIN})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert "content-security-policy" in response.headers

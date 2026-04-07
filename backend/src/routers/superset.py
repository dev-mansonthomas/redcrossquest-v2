"""Superset Guest Token endpoint."""
import http.cookiejar
import json
import logging
import re as _re
import urllib.request
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
from urllib.request import Request, build_opener, HTTPCookieProcessor

from fastapi import APIRouter, Depends, HTTPException, Request as FastAPIRequest, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..dashboards import ADMIN_ROLES, DASHBOARDS
from ..database import get_rcq_db
from .auth import get_authenticated_user as resolve_authenticated_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/superset", tags=["superset"])

# Cache for Superset admin session (cookie-based)
_cached_admin_session: urllib.request.OpenerDirector | None = None


class DashboardInfo(BaseModel):
    """Dashboard information for frontend."""

    key: str  # slug (e.g., "yearly_goal", "kpi_yearly")
    uuid: str  # Superset embed UUID
    title: str  # Display name


class DashboardListResponse(BaseModel):
    """List of accessible dashboards."""

    dashboards: list[DashboardInfo]


class GuestTokenResponse(BaseModel):
    """Response containing the Superset guest token."""

    guest_token: str


DASHBOARD_TITLES: dict[str, str] = {
    "kpi_yearly": "Objectifs Annuels",
    "yearly_goal": "Objectifs Annuels",
    "leaderboard_current_year": "Leaderboard",
    "goal_progress": "Progression Objectifs",
    "counting_treasurer": "Comptage Trésorier",
}


def _get_superset_admin_session() -> urllib.request.OpenerDirector:
    """Obtain an admin session from Superset via form login, using a simple cache.

    Superset 6.x does NOT honour Bearer JWT tokens for API authentication;
    it relies on Flask session cookies instead.  This function performs a
    browser-style form login and returns an ``OpenerDirector`` whose cookie
    jar already contains the session cookie.
    """
    global _cached_admin_session  # noqa: PLW0603

    if _cached_admin_session:
        return _cached_admin_session

    if not settings.superset_admin_password:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Superset admin credentials are not configured",
        )

    cj = http.cookiejar.CookieJar()
    opener = build_opener(HTTPCookieProcessor(cj))
    base = settings.superset_url.rstrip("/")

    # Step 1: Load login page to get CSRF token
    login_page_req = Request(f"{base}/login/")
    with opener.open(login_page_req) as resp:
        html = resp.read().decode()
    csrf_match = _re.search(r'name="csrf_token"[^>]*value="([^"]*)"', html)
    csrf_token = csrf_match.group(1) if csrf_match else ""

    # Step 2: Submit login form
    login_data = urlencode({
        "username": settings.superset_admin_username,
        "password": settings.superset_admin_password,
        "csrf_token": csrf_token,
    }).encode()
    login_req = Request(f"{base}/login/", data=login_data, method="POST")
    login_req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with opener.open(login_req) as resp:
        pass  # Session cookie is now in the cookie jar

    # Step 3: Get API CSRF token for mutations
    csrf_api_req = Request(f"{base}/api/v1/security/csrf_token/")
    with opener.open(csrf_api_req) as resp:
        csrf_data = json.loads(resp.read().decode())
    api_csrf = csrf_data["result"]

    # Store the CSRF token and base URL on the opener for later use
    opener._api_csrf = api_csrf  # type: ignore[attr-defined]
    opener._base_url = base  # type: ignore[attr-defined]

    _cached_admin_session = opener
    return opener


def _superset_api_request(
    path: str,
    *,
    method: str = "POST",
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Make an authenticated HTTP request to the Superset API.

    Uses the session-based opener (with cookies) instead of Bearer tokens.
    """
    opener = _get_superset_admin_session()
    url = urljoin(opener._base_url + "/", path.lstrip("/"))  # type: ignore[attr-defined]
    headers: dict[str, str] = {"Content-Type": "application/json"}

    # Add CSRF token for mutations
    if method in ("POST", "PUT", "DELETE"):
        headers["X-CSRFToken"] = opener._api_csrf  # type: ignore[attr-defined]
        headers["Referer"] = opener._base_url  # type: ignore[attr-defined]

    body = json.dumps(data).encode() if data else None
    req = Request(url, data=body, headers=headers, method=method)

    try:
        with opener.open(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as exc:
        detail = exc.read().decode() if exc.fp else str(exc)
        logger.error("Superset API error %s %s: %s %s", method, path, exc.code, detail)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Superset API error: {exc.code}",
        ) from exc
    except (URLError, OSError) as exc:
        logger.error("Superset connection error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Cannot reach Superset",
        ) from exc


def _get_accessible_dashboards(role: int | None) -> list[dict[str, Any]]:
    """Return the list of dashboard resources the user may access."""
    resources: list[dict[str, Any]] = []
    for _key, dash in DASHBOARDS.items():
        if role in ADMIN_ROLES or (role is not None and str(role) in dash["roles"]):
            resources.append({"type": "dashboard", "id": dash["id"]})
    return resources


def invalidate_admin_token_cache() -> None:
    """Clear the cached admin session (e.g. on auth failure)."""
    global _cached_admin_session  # noqa: PLW0603
    _cached_admin_session = None


@router.get("/dashboards", response_model=DashboardListResponse)
async def list_dashboards(
    request: FastAPIRequest,
    db: Session = Depends(get_rcq_db),
) -> DashboardListResponse:
    """Return the list of dashboards accessible to the authenticated user.

    The frontend uses this to get dashboard UUIDs instead of hardcoding them.
    """
    user = resolve_authenticated_user(request, db)
    role = user.get("role")

    role_int = int(role) if role is not None else None

    accessible: list[DashboardInfo] = []
    for key, dash in DASHBOARDS.items():
        if role_int in ADMIN_ROLES or (role_int is not None and str(role_int) in dash["roles"]):
            accessible.append(DashboardInfo(
                key=key,
                uuid=dash["id"],
                title=DASHBOARD_TITLES.get(key, key.replace("_", " ").title()),
            ))

    return DashboardListResponse(dashboards=accessible)


@router.post("/guest_token", response_model=GuestTokenResponse)
async def get_guest_token(
    request: FastAPIRequest,
    db: Session = Depends(get_rcq_db),
) -> GuestTokenResponse:
    """Generate a Superset guest token for the authenticated user.

    The token includes RLS rules scoped to the user's ``ul_id`` so that
    Superset dashboards only show data belonging to the user's local unit.
    """
    user = resolve_authenticated_user(request, db)

    ul_id = user.get("ul_id")
    if ul_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not associated with an ul_id",
        )

    role = user.get("role")
    role_int = int(role) if role is not None else None
    resources = _get_accessible_dashboards(role_int)
    if not resources:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No dashboards accessible for this role",
        )

    guest_payload = {
        "user": {
            "username": f"guest_{ul_id}",
            "first_name": "Guest",
            "last_name": str(ul_id),
        },
        "resources": resources,
        "rls": [{"clause": f"ul_id = {ul_id}"}],
    }

    try:
        result = _superset_api_request(
            "/api/v1/security/guest_token/",
            data=guest_payload,
        )
    except HTTPException:
        # Session may have expired — retry once with a fresh session
        invalidate_admin_token_cache()
        result = _superset_api_request(
            "/api/v1/security/guest_token/",
            data=guest_payload,
        )

    guest_token = result.get("token")
    if not guest_token:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Superset did not return a guest token",
        )

    return GuestTokenResponse(guest_token=guest_token)


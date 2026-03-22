"""Superset Guest Token endpoint."""
import json
import logging
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException, Request as FastAPIRequest, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..dashboards import ADMIN_ROLES, DASHBOARDS
from ..database import get_rcq_db
from .auth import get_authenticated_user as resolve_authenticated_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/superset", tags=["superset"])

# Cache for Superset admin access token
_cached_admin_token: str | None = None


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


def _superset_api_request(
    path: str,
    *,
    method: str = "POST",
    data: dict[str, Any] | None = None,
    access_token: str | None = None,
) -> dict[str, Any]:
    """Make an HTTP request to the Superset API."""
    url = urljoin(settings.superset_url.rstrip("/") + "/", path.lstrip("/"))
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"

    body = json.dumps(data).encode() if data else None
    req = Request(url, data=body, headers=headers, method=method)

    try:
        with urlopen(req, timeout=10) as resp:
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


def _get_superset_admin_token() -> str:
    """Obtain an admin access token from Superset, using a simple cache."""
    global _cached_admin_token  # noqa: PLW0603

    if _cached_admin_token:
        return _cached_admin_token

    if not settings.superset_admin_password:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Superset admin credentials are not configured",
        )

    result = _superset_api_request(
        "/api/v1/security/login",
        data={
            "username": settings.superset_admin_username,
            "password": settings.superset_admin_password,
            "provider": "db",
        },
    )
    token = result.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Superset login did not return an access token",
        )

    _cached_admin_token = token
    return token


def _get_accessible_dashboards(role: str | None) -> list[dict[str, Any]]:
    """Return the list of dashboard resources the user may access."""
    resources: list[dict[str, Any]] = []
    for _key, dash in DASHBOARDS.items():
        if role in ADMIN_ROLES or (role is not None and role in dash["roles"]):
            resources.append({"type": "dashboard", "id": dash["id"]})
    return resources


def invalidate_admin_token_cache() -> None:
    """Clear the cached admin token (e.g. on auth failure)."""
    global _cached_admin_token  # noqa: PLW0603
    _cached_admin_token = None


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

    accessible: list[DashboardInfo] = []
    for key, dash in DASHBOARDS.items():
        if role in ADMIN_ROLES or (role is not None and str(role) in dash["roles"]):
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

    resources = _get_accessible_dashboards(user.get("role"))
    if not resources:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No dashboards accessible for this role",
        )

    admin_token = _get_superset_admin_token()

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
            access_token=admin_token,
        )
    except HTTPException:
        # Admin token may have expired — retry once with a fresh token
        invalidate_admin_token_cache()
        admin_token = _get_superset_admin_token()
        result = _superset_api_request(
            "/api/v1/security/guest_token/",
            data=guest_payload,
            access_token=admin_token,
        )

    guest_token = result.get("token")
    if not guest_token:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Superset did not return a guest token",
        )

    return GuestTokenResponse(guest_token=guest_token)


"""Superset embed endpoints."""
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_rcq_db
from ..dashboards import ADMIN_ROLES, DASHBOARDS
from .auth import get_authenticated_user as resolve_authenticated_user

router = APIRouter(prefix="/api", tags=["embed"])

EMBED_ALGORITHM = "HS256"
EMBED_TOKEN_TTL_MINUTES = 10


class EmbedResponse(BaseModel):
    """Superset embed URL response."""

    embed_url: str


class AuthenticatedEmbedUser(BaseModel):
    """Authenticated user information required for Superset embed."""

    email: str
    role: str | None = None
    ul_id: int | None = None


def get_current_embed_user(
    request: Request,
    db: Session = Depends(get_rcq_db),
) -> AuthenticatedEmbedUser:
    """Resolve the authenticated user using the shared auth session logic."""
    user = AuthenticatedEmbedUser(**resolve_authenticated_user(request, db))
    if user.ul_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not associated with an ul_id",
        )

    return user


def build_embed_url(dashboard_id: str, params: dict[str, str | int]) -> str:
    """Build a signed Superset embed URL.

    Note: This will be replaced by Superset Guest Token in task 2.4.
    """
    if not settings.superset_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Superset embed settings are not configured",
        )

    payload = {
        "resource": {"dashboard": dashboard_id},
        "params": params,
        "exp": datetime.now(tz=UTC) + timedelta(minutes=EMBED_TOKEN_TTL_MINUTES),
    }
    token = jwt.encode(payload, settings.superset_admin_password, algorithm=EMBED_ALGORITHM)
    return f"{settings.superset_url.rstrip('/')}/embed/dashboard/{token}"


@router.get("/embed/{dashboard_key}", response_model=EmbedResponse)
async def get_embed_url(
    dashboard_key: str,
    request: Request,
    current_user: AuthenticatedEmbedUser = Depends(get_current_embed_user),
):
    """
    Generate signed Superset embed URL for a dashboard.

    Note: Will be replaced by Superset Guest Token in task 2.4.

    Args:
        dashboard_key: Dashboard identifier (e.g., 'kpi_yearly')
    """
    dashboard = DASHBOARDS.get(dashboard_key)
    if dashboard is None:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    user_role_int = int(current_user.role) if current_user.role is not None else 0
    if user_role_int not in ADMIN_ROLES and user_role_int not in dashboard["roles"]:
        raise HTTPException(status_code=403, detail="Dashboard access forbidden")

    params = {
        key: value
        for key, value in request.query_params.items()
        if key != "ul_id"
    }
    params["ul_id"] = current_user.ul_id

    return EmbedResponse(embed_url=build_embed_url(dashboard["id"], params))

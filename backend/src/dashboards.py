"""Superset dashboard configuration."""
from typing import TypedDict

from .config import settings
from .roles import ROLES_ADMIN_AND_ABOVE


class DashboardConfig(TypedDict):
    """Static dashboard access configuration."""

    id: str
    roles: list[int]


# Re-export for backward compat (embed.py imports ADMIN_ROLES from here)
ADMIN_ROLES = ROLES_ADMIN_AND_ABOVE

DASHBOARDS: dict[str, DashboardConfig] = {
    "kpi_yearly": {"id": settings.superset_dashboard_yearly_goal, "roles": [1, 2, 3, 4, 9]},
}

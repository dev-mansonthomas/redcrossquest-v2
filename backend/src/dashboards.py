"""Superset dashboard configuration."""
from typing import TypedDict

from .config import settings


class DashboardConfig(TypedDict):
    """Static dashboard access configuration."""

    id: str
    roles: list[str]


ADMIN_ROLES = {"admin", "super_admin"}

DASHBOARDS: dict[str, DashboardConfig] = {
    "kpi_yearly": {"id": settings.superset_dashboard_yearly_goal, "roles": ["1", "2", "3", "4"]},
    "leaderboard_current_year": {"id": "3", "roles": ["1", "2", "3"]},
    "goal_progress": {"id": "5", "roles": ["1", "2"]},
    "counting_treasurer": {"id": "2", "roles": ["1", "2", "3"]},
}

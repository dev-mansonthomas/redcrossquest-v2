"""Dashboard quête schemas for API responses."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class KPIs(BaseModel):
    """Aggregated KPIs for the current year."""

    total_temps_minutes: int
    nb_queteurs: int
    nb_sorties: int
    montant_total: float
    show_montant: bool


class ActiveQueteur(BaseModel):
    """A quêteur currently out collecting (dashboard view)."""

    first_name: str
    last_name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    point_name: Optional[str] = None
    depart: datetime | str


class DashboardSummaryResponse(BaseModel):
    """Response for the dashboard summary endpoint."""

    kpis: KPIs
    active_queteurs: list[ActiveQueteur]


class TopQueteur(BaseModel):
    """A top quêteur entry for the day."""

    first_name: str
    last_name: str
    montant: float
    temps_minutes: int
    nb_sorties: int


class Top10Response(BaseModel):
    """Response for the top 10 quêteurs endpoint."""

    queteurs: list[TopQueteur]
    show_montant: bool

"""Leaderboard schemas for API responses."""
from typing import Optional

from pydantic import BaseModel


class QueteurRanking(BaseModel):
    """A quêteur's aggregated ranking entry."""

    queteur_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    total_euro: float
    total_hours: float
    nb_sorties: int
    total_weight_kg: float
    efficiency_euro_per_hour: Optional[float] = None

    model_config = {"from_attributes": True}


class LeaderboardResponse(BaseModel):
    """Response for the leaderboard endpoint."""

    queteurs: list[QueteurRanking]


class TroncDetail(BaseModel):
    """A single tronc detail for a quêteur."""

    tronc_queteur_id: int
    total_euro: float
    hours: float
    weight_kg: float
    point_quete_name: Optional[str] = None

    model_config = {"from_attributes": True}


class TroncsResponse(BaseModel):
    """Response for the quêteur troncs drill-down endpoint."""

    troncs: list[TroncDetail]

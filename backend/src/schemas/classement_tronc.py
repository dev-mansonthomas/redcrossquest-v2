"""Classement par Tronc schemas for API responses."""
from typing import Optional

from pydantic import BaseModel


class TroncRanking(BaseModel):
    """A single tronc ranking entry (one row per tronc_queteur)."""

    tronc_queteur_id: int
    queteur_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    point_quete_name: Optional[str] = None
    total_euro: float
    hours: float
    weight_kg: float
    efficiency_euro_per_hour: Optional[float] = None

    model_config = {"from_attributes": True}


class ClassementTroncResponse(BaseModel):
    """Response for the classement-tronc leaderboard endpoint."""

    queteurs: list[TroncRanking]


class TroncChampion(BaseModel):
    """A champion tronc for a quêteur in the drill-down view.

    If the same tronc is champion in multiple metrics, ``champion_types``
    will contain all of them (e.g. ``["montant", "poids"]``).
    """

    tronc_queteur_id: int
    point_quete_name: Optional[str] = None
    total_euro: float
    hours: float
    weight_kg: float
    champion_types: list[str]

    model_config = {"from_attributes": True}


class TroncsChampionsResponse(BaseModel):
    """Response for the quêteur champion troncs drill-down endpoint."""

    troncs: list[TroncChampion]

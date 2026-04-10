"""Classement par Tronc schemas for API responses."""
from typing import Optional

from pydantic import BaseModel


class QueteurBestTronc(BaseModel):
    """Un quêteur avec ses meilleurs troncs (MAX par métrique)."""

    queteur_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    secteur: Optional[int] = None
    best_montant: float
    best_poids_kg: float
    best_duree_h: float
    best_taux_horaire: Optional[float] = None

    model_config = {"from_attributes": True}


class ClassementTroncResponse(BaseModel):
    """Response for the classement-tronc leaderboard endpoint."""

    queteurs: list[QueteurBestTronc]


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

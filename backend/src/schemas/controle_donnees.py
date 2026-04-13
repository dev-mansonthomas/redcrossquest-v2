"""Contrôle de données schemas for API responses."""
from typing import Optional

from pydantic import BaseModel


class QueteurControleSummary(BaseModel):
    """Aggregated data-control entry per quêteur."""

    queteur_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    nb_troncs: int
    total_amount: float
    total_hours: float
    total_weight_kg: float

    model_config = {"from_attributes": True}


class ControleDonneesResponse(BaseModel):
    """Response for the contrôle de données list endpoint."""

    queteurs: list[QueteurControleSummary]


class TroncControleDetail(BaseModel):
    """A single tronc detail in the contrôle de données drill-down."""

    tronc_queteur_id: int
    tronc_id: int
    total_amount: float
    hours: float
    weight_kg: float
    point_quete_name: Optional[str] = None
    quete_day_num: Optional[int] = None

    model_config = {"from_attributes": True}


class TroncsControleResponse(BaseModel):
    """Response for the contrôle de données drill-down endpoint."""

    troncs: list[TroncControleDetail]

"""États des troncs schemas for API responses."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TroncEtatDetail(BaseModel):
    """Detail of a tronc in a given state (prepared/collecting/uncounted/counted)."""

    tronc_queteur_id: int
    queteur_id: int
    tronc_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    depart_theorique: Optional[datetime] = None
    depart: Optional[datetime] = None
    retour: Optional[datetime] = None
    point_quete_name: Optional[str] = None
    quete_day_num: Optional[int] = None
    total_amount: Optional[float] = None
    total_hours: Optional[float] = None

    model_config = {"from_attributes": True}


class EtatsTroncsResponse(BaseModel):
    """Response for the états des troncs endpoint."""

    troncs: list[TroncEtatDetail]

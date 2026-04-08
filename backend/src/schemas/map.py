"""Map schemas for API responses."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ActiveQueteur(BaseModel):
    """A quêteur currently out collecting."""

    first_name: str
    last_name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    point_name: Optional[str] = None
    address: Optional[str] = None
    depart: datetime

    model_config = {"from_attributes": True}


class ActiveQueteursResponse(BaseModel):
    """Response for the active quêteurs endpoint."""

    queteurs: list[ActiveQueteur]

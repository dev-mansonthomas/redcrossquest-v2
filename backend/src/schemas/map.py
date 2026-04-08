"""Map schemas for API responses."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ActiveQueteur(BaseModel):
    """A quêteur currently out collecting."""

    first_name: str
    last_name: str
    man: bool
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    point_name: Optional[str] = None
    address: Optional[str] = None
    depart: datetime
    point_quete_id: int
    point_code: Optional[str] = None

    model_config = {"from_attributes": True}


class ActiveQueteursResponse(BaseModel):
    """Response for the active quêteurs endpoint."""

    queteurs: list[ActiveQueteur]


class PointQuete(BaseModel):
    """A point de quête (collection point)."""

    id: int
    name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None
    type: int = 1
    code: Optional[str] = None

    model_config = {"from_attributes": True}


class PointsQueteResponse(BaseModel):
    """Response for the points de quête endpoint."""

    points_quete: list[PointQuete]


class AvailableYearsResponse(BaseModel):
    """Response for the available years endpoint."""

    years: list[int]


class PointQueteStats(BaseModel):
    """A point de quête with aggregated statistics."""

    id: int
    name: Optional[str] = None
    code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    type: int = 1
    address: Optional[str] = None
    total_amount: float = 0
    total_hours: float = 0
    tronc_count: int = 0
    hourly_rate: float = 0
    active_queteurs: int = 0

    model_config = {"from_attributes": True}


class PointsQueteStatsResponse(BaseModel):
    """Response for the points de quête stats endpoint."""

    points_quete: list[PointQueteStats]

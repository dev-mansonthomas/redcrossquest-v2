"""Pydantic schemas for the /api/merci/{uuid} endpoint."""
from typing import Optional

from pydantic import BaseModel


class PointQueteMerci(BaseModel):
    id: int
    name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None
    type: int = 1
    total_amount: float


class MerciStats(BaseModel):
    total_amount: float
    total_hours: float
    total_weight_grams: float
    tronc_count: int


class MerciResponse(BaseModel):
    queteur_first_name: str
    queteur_man: bool
    thanks_message: Optional[str] = None
    year: int
    available_years: list[int]
    stats: MerciStats
    points_quete: list[PointQueteMerci]

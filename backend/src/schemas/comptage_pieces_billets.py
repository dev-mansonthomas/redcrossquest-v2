"""Comptage pièces, billets et CB schemas for API responses."""
from pydantic import BaseModel


class DenominationCount(BaseModel):
    """A single denomination (coin or bill) with its count and total."""
    label: str
    value_cents: int
    count: int
    total: float


class CbTicket(BaseModel):
    """A single CB ticket amount with its count and total."""
    amount: float
    count: int
    total: float


class ComptagePiecesBilletsResponse(BaseModel):
    """Response for the comptage-pieces-billets endpoint."""
    pieces: list[DenominationCount] = []
    billets: list[DenominationCount] = []
    cb_tickets: list[CbTicket] = []
    year: int
    available_years: list[int] = []

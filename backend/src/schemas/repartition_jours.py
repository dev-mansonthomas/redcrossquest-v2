"""Répartition journalière schemas for API responses."""
from pydantic import BaseModel


class DailyAmount(BaseModel):
    """A single daily amount data point."""
    year: int
    jour_num: int
    montant_jour: float


class RepartitionJoursResponse(BaseModel):
    """Response for the repartition-jours endpoint.

    Contains non-cumulated daily amounts for all available years,
    plus min/max/current year metadata.
    """
    data: list[DailyAmount] = []
    min_year: int
    max_year: int
    current_year: int

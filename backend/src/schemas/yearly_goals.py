"""Yearly Goals schemas for API responses."""
from pydantic import BaseModel


class YearlyGoalDataPoint(BaseModel):
    """A single data point in the yearly goals chart."""
    year: int
    jour_num: int
    serie: str
    montant_cumule: float


class YearlyGoalsResponse(BaseModel):
    """Response for the yearly-goals endpoint.

    Contains both 'Réalisé' (actual collections) and 'Objectif' (goal)
    series, each broken down by year and day number (jour_num 1-9).
    """
    data: list[YearlyGoalDataPoint] = []

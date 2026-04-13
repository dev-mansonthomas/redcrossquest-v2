"""UL (Unité Locale) schemas for API responses."""
from typing import Optional

from pydantic import BaseModel


class UlSearchResult(BaseModel):
    """A single UL search result."""

    id: int
    name: str
    postal_code: str | None = None


class UlSearchResponse(BaseModel):
    """Response for UL search endpoint."""

    results: list[UlSearchResult]


# ---------------------------------------------------------------------------
# Vue globale UL — overview (multi-year)
# ---------------------------------------------------------------------------

class FinancialYear(BaseModel):
    """Financial totals for a single year, broken down by payment type."""
    year: int
    total_billets: float = 0
    total_pieces: float = 0
    total_cb: float = 0
    total_cheques: float = 0


class HoursBySector(BaseModel):
    """Hours of quête for a given year and sector."""
    year: int
    secteur: int
    label: str
    total_hours: float = 0


class QueteursBySector(BaseModel):
    """Distinct quêteurs for a given year and sector."""
    year: int
    secteur: int
    label: str
    nb_queteurs: int = 0


class ActivityYear(BaseModel):
    """Activity metrics for a single year."""
    year: int
    nb_tronc_queteur: int = 0
    nb_points_quete: int = 0
    nb_troncs: int = 0


class UlOverviewResponse(BaseModel):
    """Multi-year overview of a UL's quête activity (last 5 years)."""
    years: list[int] = []
    financials: list[FinancialYear] = []
    hours_by_sector: list[HoursBySector] = []
    queteurs_by_sector: list[QueteursBySector] = []
    activity_metrics: list[ActivityYear] = []

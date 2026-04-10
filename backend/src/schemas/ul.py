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
# Vue globale UL — overview
# ---------------------------------------------------------------------------

class SecteurStats(BaseModel):
    """Aggregated stats for a quêteur secteur (type)."""

    secteur: int
    label: str
    nb_queteurs: int = 0
    total_euro: float = 0
    total_hours: float = 0
    nb_sorties: int = 0
    total_weight_kg: float = 0

    model_config = {"from_attributes": True}


class UlOverviewResponse(BaseModel):
    """Global overview of a UL's quête activity for a given year."""

    year: int
    ul_id: int
    ul_name: Optional[str] = None
    total_euro: float = 0
    total_hours: float = 0
    total_queteurs: int = 0
    nb_sorties: int = 0
    total_weight_kg: float = 0
    secteurs: list[SecteurStats] = []
    from_cache: bool = False

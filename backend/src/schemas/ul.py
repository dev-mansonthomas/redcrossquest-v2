"""UL (Unité Locale) schemas for API responses."""
from pydantic import BaseModel


class UlSearchResult(BaseModel):
    """A single UL search result."""

    id: int
    name: str


class UlSearchResponse(BaseModel):
    """Response for UL search endpoint."""

    results: list[UlSearchResult]

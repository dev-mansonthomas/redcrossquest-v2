"""UL (Unité Locale) schemas for API responses."""
from pydantic import BaseModel


class UlSearchResult(BaseModel):
    """A single UL search result."""

    id: int
    name: str
    postal_code: str | None = None


class UlSearchResponse(BaseModel):
    """Response for UL search endpoint."""

    results: list[UlSearchResult]

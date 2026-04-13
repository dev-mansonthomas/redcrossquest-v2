"""Stats journalières schemas for API responses."""
from pydantic import BaseModel


class DailyStats(BaseModel):
    """A single day's aggregated statistics."""
    jour_num: int
    montant_jour: float
    montant_cb: float
    nb_benevoles: int
    nb_benevoles_1j: int
    nb_heures: float


class StatsJournalieresResponse(BaseModel):
    """Response for the stats-journalieres endpoint."""
    data: list[DailyStats] = []
    year: int
    available_years: list[int] = []

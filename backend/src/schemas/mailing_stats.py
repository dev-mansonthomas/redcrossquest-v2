"""Pydantic models for mailing stats (suivi mail remerciement)."""
from pydantic import BaseModel


class MailingStatsEntry(BaseModel):
    queteur_id: int
    first_name: str
    last_name: str
    email_send_date: str
    status_code: str


class CumulativeOpenPoint(BaseModel):
    open_date: str          # date ISO (YYYY-MM-DD)
    secteur_label: str      # Bénévole, Bénévole d'un jour, Ancien bénévole, Commerçant, Spécial
    cumulative_count: int


class SummaryBySecteur(BaseModel):
    secteur_label: str
    total_sent: int
    total_opened: int


class SummaryByStatus(BaseModel):
    status_code: str
    label: str
    count: int


class MailingStatsResponse(BaseModel):
    available_years: list[int]
    cumulative_opens: list[CumulativeOpenPoint]
    summary_by_secteur: list[SummaryBySecteur]
    summary_by_status: list[SummaryByStatus]
    table_data: list[MailingStatsEntry]

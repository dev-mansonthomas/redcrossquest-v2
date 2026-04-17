"""Pydantic schemas for the Super Admin dashboard."""
from pydantic import BaseModel


class GlobalKPIs(BaseModel):
    nb_ul: int
    nb_queteurs: int
    total_heures: int
    total_euros: float
    total_pieces_euros: float
    total_billets_euros: float
    total_cb_euros: float
    total_cheques_euros: float


class YearlyStats(BaseModel):
    year: int
    nb_ul: int
    nb_queteurs: int
    total_heures: int
    total_euros: float
    total_pieces_euros: float
    total_billets_euros: float
    total_cb_euros: float
    total_cheques_euros: float


class YearlyStatsResponse(BaseModel):
    years: list[YearlyStats]

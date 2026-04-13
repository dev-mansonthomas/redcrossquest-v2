"""Contrôle de données endpoints for data-quality review."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request as FastAPIRequest, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_rcq_db
from ..schemas.controle_donnees import (
    ControleDonneesResponse,
    QueteurControleSummary,
    TroncControleDetail,
    TroncsControleResponse,
)
from ..utils import build_year_filter
from .auth import get_authenticated_user

router = APIRouter(prefix="/api/controle-donnees", tags=["controle-donnees"])

ALLOWED_ROLES = {"4", "9"}


def _check_role(user: dict) -> None:
    """Raise 403 if the user role is not in ALLOWED_ROLES."""
    if str(user.get("role")) not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux rôles admin ou super admin",
        )


def _build_days_filter(days: Optional[str]) -> tuple[str, dict]:
    """Return (SQL clause, params dict) for quete_day_num filtering.

    *days* is a comma-separated list of day numbers (e.g. "1,2,3").
    Returns an empty clause when *days* is ``None`` or empty.
    """
    if not days or not days.strip():
        return "", {}
    day_list = [int(d.strip()) for d in days.split(",") if d.strip()]
    if not day_list:
        return "", {}
    placeholders = ", ".join(f":day_{i}" for i in range(len(day_list)))
    params = {f"day_{i}": d for i, d in enumerate(day_list)}
    return f"AND tqe.quete_day_num IN ({placeholders})", params


CONTROLE_QUERY = """
    SELECT
      q.id AS queteur_id,
      q.first_name,
      q.last_name,
      COUNT(*) AS nb_troncs,
      ROUND(SUM(tqe.total_amount), 2) AS total_amount,
      ROUND(SUM(tqe.duration_minutes) / 60.0, 2) AS total_hours,
      ROUND(SUM(tqe.weight) / 1000, 2) AS total_weight_kg
    FROM v_tronc_queteur_enriched tqe
    JOIN queteur q ON tqe.queteur_id = q.id
    WHERE tqe.ul_id = :ul_id
      {year_filter}
      {days_filter}
    GROUP BY q.id, q.first_name, q.last_name
    ORDER BY total_amount DESC
"""

TRONCS_CONTROLE_QUERY = """
    SELECT
      tqe.id AS tronc_queteur_id,
      tqe.tronc_id,
      ROUND(tqe.total_amount, 2) AS total_amount,
      ROUND(tqe.duration_minutes / 60.0, 2) AS hours,
      ROUND(tqe.weight / 1000, 2) AS weight_kg,
      pq.name AS point_quete_name,
      tqe.quete_day_num
    FROM v_tronc_queteur_enriched tqe
    JOIN point_quete pq ON tqe.point_quete_id = pq.id
    WHERE tqe.queteur_id = :queteur_id
      AND tqe.ul_id = :ul_id
      {year_filter}
      {days_filter}
    ORDER BY tqe.depart DESC
"""


@router.get("", response_model=ControleDonneesResponse)
async def get_controle_donnees(
    request: FastAPIRequest,
    year: Optional[int] = Query(default=None, description="Année (défaut: année courante, 0=toutes)"),
    days: Optional[str] = Query(default=None, description="Jours de quête (ex: 1,2,3)"),
    db: Session = Depends(get_rcq_db),
) -> ControleDonneesResponse:
    """Return aggregated data per quêteur for data-quality control."""
    user = get_authenticated_user(request, db)
    _check_role(user)

    year_clause, year_params = build_year_filter(year)
    days_clause, days_params = _build_days_filter(days)
    query = CONTROLE_QUERY.format(year_filter=year_clause, days_filter=days_clause)
    params = {"ul_id": user["ul_id"], **year_params, **days_params}

    rows = db.execute(text(query), params).mappings().all()
    queteurs = [QueteurControleSummary(**row) for row in rows]
    return ControleDonneesResponse(queteurs=queteurs)


@router.get("/{queteur_id}/troncs", response_model=TroncsControleResponse)
async def get_queteur_troncs_controle(
    queteur_id: int,
    request: FastAPIRequest,
    year: Optional[int] = Query(default=None, description="Année (défaut: année courante, 0=toutes)"),
    days: Optional[str] = Query(default=None, description="Jours de quête (ex: 1,2,3)"),
    db: Session = Depends(get_rcq_db),
) -> TroncsControleResponse:
    """Return tronc details for a specific quêteur (drill-down)."""
    user = get_authenticated_user(request, db)
    _check_role(user)

    year_clause, year_params = build_year_filter(year)
    days_clause, days_params = _build_days_filter(days)
    query = TRONCS_CONTROLE_QUERY.format(year_filter=year_clause, days_filter=days_clause)
    params = {
        "queteur_id": queteur_id,
        "ul_id": user["ul_id"],
        **year_params,
        **days_params,
    }

    rows = db.execute(text(query), params).mappings().all()
    troncs = [TroncControleDetail(**row) for row in rows]
    return TroncsControleResponse(troncs=troncs)

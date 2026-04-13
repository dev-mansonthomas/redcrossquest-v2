"""Classement Global endpoints for quêteur rankings."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request as FastAPIRequest, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_rcq_db
from ..schemas.classement import (
    QueteurRanking,
    ClassementGlobalResponse,
    TroncDetail,
    TroncsResponse,
)
from ..utils import build_secteur_filter, build_year_filter
from .auth import get_authenticated_user

router = APIRouter(prefix="/api/classement-global", tags=["classement-global"])

ALLOWED_ROLES = {"4", "9"}


def _check_role(user: dict) -> None:
    """Raise 403 if the user role is not in ALLOWED_ROLES."""
    if str(user.get("role")) not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux rôles admin ou super admin",
        )


LEADERBOARD_QUERY_BASE = """
    SELECT
      q.id AS queteur_id,
      q.first_name,
      q.last_name,
      ROUND(SUM(tqe.total_amount), 2) AS total_euro,
      ROUND(SUM(tqe.duration_minutes) / 60.0, 2) AS total_hours,
      COUNT(*) AS nb_sorties,
      ROUND(SUM(tqe.weight) / 1000, 2) AS total_weight_kg,
      ROUND(
        SUM(tqe.total_amount) / NULLIF(SUM(tqe.duration_minutes) / 60.0, 0),
        2
      ) AS efficiency_euro_per_hour
    FROM v_tronc_queteur_enriched tqe
    JOIN queteur q ON tqe.queteur_id = q.id
    WHERE tqe.ul_id = :ul_id {year_filter}
    {secteur_filter}
    GROUP BY q.id, q.first_name, q.last_name
    ORDER BY total_euro DESC
"""

TRONCS_QUERY = """
    SELECT
      tqe.id AS tronc_queteur_id,
      ROUND(tqe.total_amount, 2) AS total_euro,
      ROUND(tqe.duration_minutes / 60.0, 2) AS hours,
      ROUND(tqe.weight / 1000, 2) AS weight_kg,
      pq.name AS point_quete_name
    FROM v_tronc_queteur_enriched tqe
    JOIN point_quete pq ON tqe.point_quete_id = pq.id
    JOIN queteur q ON tqe.queteur_id = q.id
    WHERE tqe.queteur_id = :queteur_id
      AND tqe.ul_id = :ul_id
      {year_filter}
      {secteur_filter}
    ORDER BY tqe.depart DESC
"""


@router.get("", response_model=ClassementGlobalResponse)
async def get_classement_global(
    request: FastAPIRequest,
    year: Optional[int] = Query(default=None, description="Année (défaut: année courante, 0=toutes)"),
    secteur: str = Query(default=None, description="Filtre secteur"),
    db: Session = Depends(get_rcq_db),
) -> ClassementGlobalResponse:
    """Return quêteur classement ranked by total amount collected."""
    user = get_authenticated_user(request, db)
    _check_role(user)

    year_clause, year_params = build_year_filter(year)
    secteur_clause, secteur_params = build_secteur_filter(secteur)
    query = LEADERBOARD_QUERY_BASE.format(year_filter=year_clause, secteur_filter=secteur_clause)
    params = {"ul_id": user["ul_id"], **year_params, **secteur_params}

    rows = db.execute(text(query), params).mappings().all()
    queteurs = [QueteurRanking(**row) for row in rows]
    return ClassementGlobalResponse(queteurs=queteurs)


@router.get("/{queteur_id}/troncs", response_model=TroncsResponse)
async def get_queteur_troncs(
    queteur_id: int,
    request: FastAPIRequest,
    year: Optional[int] = Query(default=None, description="Année (défaut: année courante, 0=toutes)"),
    secteur: str = Query(default=None, description="Filtre secteur"),
    db: Session = Depends(get_rcq_db),
) -> TroncsResponse:
    """Return tronc details for a specific quêteur (drill-down)."""
    user = get_authenticated_user(request, db)
    _check_role(user)

    year_clause, year_params = build_year_filter(year)
    secteur_clause, secteur_params = build_secteur_filter(secteur)
    query = TRONCS_QUERY.format(year_filter=year_clause, secteur_filter=secteur_clause)
    params = {
        "queteur_id": queteur_id,
        "ul_id": user["ul_id"],
        **year_params,
        **secteur_params,
    }

    rows = db.execute(text(query), params).mappings().all()
    troncs = [TroncDetail(**row) for row in rows]
    return TroncsResponse(troncs=troncs)

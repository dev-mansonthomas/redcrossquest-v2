"""Leaderboard endpoints for collector rankings."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request as FastAPIRequest, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_rcq_db
from ..schemas.leaderboard import (
    CollectorRanking,
    LeaderboardResponse,
    TroncDetail,
    TroncsResponse,
)
from .auth import get_authenticated_user

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])

ALLOWED_ROLES = {"4", "9"}


def _check_role(user: dict) -> None:
    """Raise 403 if the user role is not in ALLOWED_ROLES."""
    if str(user.get("role")) not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux rôles admin ou super admin",
        )


LEADERBOARD_QUERY = """
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
    WHERE tqe.ul_id = :ul_id AND YEAR(tqe.depart) = :year
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
    WHERE tqe.queteur_id = :queteur_id
      AND tqe.ul_id = :ul_id
      AND YEAR(tqe.depart) = :year
    ORDER BY tqe.depart DESC
"""


@router.get("", response_model=LeaderboardResponse)
async def get_leaderboard(
    request: FastAPIRequest,
    year: int = Query(default=None, description="Année (défaut: année courante)"),
    db: Session = Depends(get_rcq_db),
) -> LeaderboardResponse:
    """Return collector leaderboard ranked by total amount collected."""
    user = get_authenticated_user(request, db)
    _check_role(user)

    if year is None:
        year = datetime.now().year

    ul_id = user["ul_id"]
    rows = db.execute(
        text(LEADERBOARD_QUERY), {"ul_id": ul_id, "year": year}
    ).mappings().all()

    collectors = [CollectorRanking(**row) for row in rows]
    return LeaderboardResponse(collectors=collectors)


@router.get("/{queteur_id}/troncs", response_model=TroncsResponse)
async def get_collector_troncs(
    queteur_id: int,
    request: FastAPIRequest,
    year: int = Query(default=None, description="Année (défaut: année courante)"),
    db: Session = Depends(get_rcq_db),
) -> TroncsResponse:
    """Return tronc details for a specific collector (drill-down)."""
    user = get_authenticated_user(request, db)
    _check_role(user)

    if year is None:
        year = datetime.now().year

    ul_id = user["ul_id"]
    rows = db.execute(
        text(TRONCS_QUERY),
        {"queteur_id": queteur_id, "ul_id": ul_id, "year": year},
    ).mappings().all()

    troncs = [TroncDetail(**row) for row in rows]
    return TroncsResponse(troncs=troncs)

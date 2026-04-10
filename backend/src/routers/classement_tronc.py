"""Classement par Tronc endpoints for individual tronc rankings."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request as FastAPIRequest, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_rcq_db
from ..schemas.classement_tronc import (
    QueteurBestTronc,
    ClassementTroncResponse,
    TroncChampion,
    TroncsChampionsResponse,
)
from ..utils import build_secteur_filter
from .auth import get_authenticated_user

router = APIRouter(prefix="/api/classement-tronc", tags=["classement-tronc"])

ALLOWED_ROLES = {"4", "9"}


def _check_role(user: dict) -> None:
    """Raise 403 if the user role is not in ALLOWED_ROLES."""
    if str(user.get("role")) not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux rôles admin ou super admin",
        )


TRONC_LEADERBOARD_QUERY = """
    SELECT
      q.id AS queteur_id,
      q.first_name,
      q.last_name,
      q.secteur,
      ROUND(MAX(tqe.total_amount), 2) AS best_montant,
      ROUND(MAX(tqe.weight) / 1000, 2) AS best_poids_kg,
      ROUND(MAX(tqe.duration_minutes) / 60.0, 2) AS best_duree_h,
      ROUND(MAX(
        tqe.total_amount / NULLIF(tqe.duration_minutes / 60.0, 0)
      ), 2) AS best_taux_horaire
    FROM v_tronc_queteur_enriched tqe
    JOIN queteur q ON tqe.queteur_id = q.id
    WHERE tqe.ul_id = :ul_id
      AND YEAR(tqe.depart) = :year
      AND tqe.deleted = 0
      AND tqe.comptage IS NOT NULL
    {secteur_filter}
    GROUP BY q.id, q.first_name, q.last_name, q.secteur
    ORDER BY best_montant DESC
"""

CHAMPION_TRONCS_QUERY = """
    SELECT
      tqe.id AS tronc_queteur_id,
      pq.name AS point_quete_name,
      ROUND(tqe.total_amount, 2) AS total_euro,
      ROUND(tqe.duration_minutes / 60.0, 2) AS hours,
      ROUND(tqe.weight / 1000, 2) AS weight_kg,
      '{metric}' AS champion_type
    FROM v_tronc_queteur_enriched tqe
    JOIN point_quete pq ON tqe.point_quete_id = pq.id
    JOIN queteur q ON tqe.queteur_id = q.id
    WHERE tqe.queteur_id = :queteur_id
      AND tqe.ul_id = :ul_id
      AND YEAR(tqe.depart) = :year
      {secteur_filter}
    ORDER BY {order_col} DESC
    LIMIT 1
"""

CHAMPION_METRICS = [
    ("montant", "tqe.total_amount"),
    ("poids", "tqe.weight"),
    ("duree", "tqe.duration_minutes"),
]


@router.get("", response_model=ClassementTroncResponse)
async def get_classement_tronc(
    request: FastAPIRequest,
    year: int = Query(default=None, description="Année (défaut: année courante)"),
    secteur: str = Query(default=None, description="Filtre secteur"),
    db: Session = Depends(get_rcq_db),
) -> ClassementTroncResponse:
    """Return tronc classement ranked by total amount collected."""
    user = get_authenticated_user(request, db)
    _check_role(user)

    if year is None:
        year = datetime.now().year

    secteur_clause, secteur_params = build_secteur_filter(secteur)
    query = TRONC_LEADERBOARD_QUERY.format(secteur_filter=secteur_clause)
    params = {"ul_id": user["ul_id"], "year": year, **secteur_params}

    rows = db.execute(text(query), params).mappings().all()
    queteurs = [QueteurBestTronc(**row) for row in rows]
    return ClassementTroncResponse(queteurs=queteurs)


@router.get("/{queteur_id}/troncs-champions", response_model=TroncsChampionsResponse)
async def get_troncs_champions(
    queteur_id: int,
    request: FastAPIRequest,
    year: int = Query(default=None, description="Année (défaut: année courante)"),
    secteur: str = Query(default=None, description="Filtre secteur"),
    db: Session = Depends(get_rcq_db),
) -> TroncsChampionsResponse:
    """Return champion troncs for a quêteur (drill-down).

    Each metric (montant, poids, duree) finds the best tronc. If the same
    tronc wins multiple metrics, it appears once with all champion_types.
    """
    user = get_authenticated_user(request, db)
    _check_role(user)

    if year is None:
        year = datetime.now().year

    secteur_clause, secteur_params = build_secteur_filter(secteur)
    base_params = {
        "queteur_id": queteur_id,
        "ul_id": user["ul_id"],
        "year": year,
        **secteur_params,
    }

    # Collect champion troncs per metric
    champions: dict[int, dict] = {}
    for metric_name, order_col in CHAMPION_METRICS:
        query = CHAMPION_TRONCS_QUERY.format(
            metric=metric_name,
            order_col=order_col,
            secteur_filter=secteur_clause,
        )
        rows = db.execute(text(query), base_params).mappings().all()
        for row in rows:
            tqid = row["tronc_queteur_id"]
            if tqid in champions:
                champions[tqid]["champion_types"].append(metric_name)
            else:
                champions[tqid] = {
                    "tronc_queteur_id": row["tronc_queteur_id"],
                    "point_quete_name": row["point_quete_name"],
                    "total_euro": row["total_euro"],
                    "hours": row["hours"],
                    "weight_kg": row["weight_kg"],
                    "champion_types": [metric_name],
                }

    troncs = [TroncChampion(**data) for data in champions.values()]
    return TroncsChampionsResponse(troncs=troncs)

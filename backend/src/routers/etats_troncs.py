"""États des troncs endpoints — prepared / collecting / uncounted / counted."""
from datetime import datetime
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request as FastAPIRequest, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_rcq_db
from ..roles import ROLES_COMPTEUR_AND_ABOVE, check_role
from ..schemas.etats_troncs import EtatsTroncsResponse, TroncEtatDetail
from .auth import get_authenticated_user

router = APIRouter(prefix="/api/etats-troncs", tags=["etats-troncs"])

class TroncStatus(str, Enum):
    """Allowed status values for the tronc state filter."""

    prepared = "prepared"
    collecting = "collecting"
    uncounted = "uncounted"
    counted = "counted"
    missing_bags = "missing_bags"


STATUS_FILTERS: dict[TroncStatus, str] = {
    TroncStatus.prepared: "AND tq.depart_theorique IS NOT NULL AND tq.depart IS NULL",
    TroncStatus.collecting: "AND tq.depart IS NOT NULL AND tq.retour IS NULL",
    TroncStatus.uncounted: "AND tq.retour IS NOT NULL AND tq.comptage IS NULL",
    TroncStatus.counted: "AND tq.comptage IS NOT NULL",
    TroncStatus.missing_bags: "AND tq.comptage IS NOT NULL AND (tq.coins_money_bag_id IS NULL OR tq.coins_money_bag_id = '' OR tq.bills_money_bag_id IS NULL OR tq.bills_money_bag_id = '')",
}



def _build_year_filter(year: Optional[int]) -> tuple[str, dict]:
    """Return (SQL clause, params) for year filtering on tronc_queteur.

    Uses COALESCE(tq.depart, tq.depart_theorique) so that:
    - For "prepared" troncs (depart IS NULL), the filter applies to depart_theorique.
    - For other statuses, it applies to depart.

    ``None`` → current year.  ``0`` → no filter.
    """
    if year is None:
        year = datetime.now().year
    if year == 0:
        return "", {}
    return "AND YEAR(COALESCE(tq.depart, tq.depart_theorique)) = :year", {"year": year}


ETATS_TRONCS_QUERY = """
    SELECT
      tq.id   AS tronc_queteur_id,
      tq.queteur_id,
      tq.tronc_id,
      q.first_name,
      q.last_name,
      tq.depart_theorique,
      tq.depart,
      tq.retour,
      pq.name AS point_quete_name,
      DATEDIFF(DATE(COALESCE(tq.depart, tq.depart_theorique)), qd.start_date) + 1 AS quete_day_num
    FROM tronc_queteur tq
    JOIN queteur q        ON tq.queteur_id   = q.id
    LEFT JOIN point_quete pq ON tq.point_quete_id = pq.id
    LEFT JOIN quete_dates qd ON qd.year = YEAR(COALESCE(tq.depart, tq.depart_theorique))
    WHERE tq.ul_id   = :ul_id
      AND tq.deleted = 0
      {status_filter}
      {year_filter}
    ORDER BY COALESCE(tq.depart, tq.depart_theorique) DESC
"""

ETATS_TRONCS_COUNTED_QUERY = """
    SELECT
      tq.id   AS tronc_queteur_id,
      tq.queteur_id,
      tq.tronc_id,
      q.first_name,
      q.last_name,
      tq.depart_theorique,
      tq.depart,
      tq.retour,
      pq.name AS point_quete_name,
      DATEDIFF(DATE(COALESCE(tq.depart, tq.depart_theorique)), qd.start_date) + 1 AS quete_day_num,
      COALESCE(tq.euro500, 0) * 500 +
      COALESCE(tq.euro200, 0) * 200 +
      COALESCE(tq.euro100, 0) * 100 +
      COALESCE(tq.euro50, 0) * 50 +
      COALESCE(tq.euro20, 0) * 20 +
      COALESCE(tq.euro10, 0) * 10 +
      COALESCE(tq.euro5, 0) * 5 +
      COALESCE(tq.euro2, 0) * 2 +
      COALESCE(tq.euro1, 0) * 1 +
      COALESCE(tq.cents50, 0) * 0.5 +
      COALESCE(tq.cents20, 0) * 0.2 +
      COALESCE(tq.cents10, 0) * 0.1 +
      COALESCE(tq.cents5, 0) * 0.05 +
      COALESCE(tq.cents2, 0) * 0.02 +
      COALESCE(tq.cent1, 0) * 0.01 +
      COALESCE(tq.don_cheque, 0) +
      COALESCE(tq.don_creditcard, 0) AS total_amount,
      ROUND(TIMESTAMPDIFF(MINUTE, tq.depart, tq.retour) / 60.0, 2) AS total_hours
    FROM tronc_queteur tq
    JOIN queteur q        ON tq.queteur_id   = q.id
    LEFT JOIN point_quete pq ON tq.point_quete_id = pq.id
    LEFT JOIN quete_dates qd ON qd.year = YEAR(COALESCE(tq.depart, tq.depart_theorique))
    WHERE tq.ul_id   = :ul_id
      AND tq.deleted = 0
      AND tq.comptage IS NOT NULL
      {year_filter}
    ORDER BY tq.comptage DESC
"""

ETATS_TRONCS_MISSING_BAGS_QUERY = """
    SELECT
      tq.id   AS tronc_queteur_id,
      tq.queteur_id,
      tq.tronc_id,
      q.first_name,
      q.last_name,
      tq.depart_theorique,
      tq.depart,
      tq.retour,
      pq.name AS point_quete_name,
      DATEDIFF(DATE(COALESCE(tq.depart, tq.depart_theorique)), qd.start_date) + 1 AS quete_day_num,
      COALESCE(tq.euro500, 0) * 500 +
      COALESCE(tq.euro200, 0) * 200 +
      COALESCE(tq.euro100, 0) * 100 +
      COALESCE(tq.euro50, 0) * 50 +
      COALESCE(tq.euro20, 0) * 20 +
      COALESCE(tq.euro10, 0) * 10 +
      COALESCE(tq.euro5, 0) * 5 +
      COALESCE(tq.euro2, 0) * 2 +
      COALESCE(tq.euro1, 0) * 1 +
      COALESCE(tq.cents50, 0) * 0.5 +
      COALESCE(tq.cents20, 0) * 0.2 +
      COALESCE(tq.cents10, 0) * 0.1 +
      COALESCE(tq.cents5, 0) * 0.05 +
      COALESCE(tq.cents2, 0) * 0.02 +
      COALESCE(tq.cent1, 0) * 0.01 +
      COALESCE(tq.don_cheque, 0) +
      COALESCE(tq.don_creditcard, 0) AS total_amount,
      ROUND(TIMESTAMPDIFF(MINUTE, tq.depart, tq.retour) / 60.0, 2) AS total_hours,
      tq.coins_money_bag_id,
      tq.bills_money_bag_id
    FROM tronc_queteur tq
    JOIN queteur q        ON tq.queteur_id   = q.id
    LEFT JOIN point_quete pq ON tq.point_quete_id = pq.id
    LEFT JOIN quete_dates qd ON qd.year = YEAR(COALESCE(tq.depart, tq.depart_theorique))
    WHERE tq.ul_id   = :ul_id
      AND tq.deleted = 0
      AND tq.comptage IS NOT NULL
      AND (tq.coins_money_bag_id IS NULL OR tq.coins_money_bag_id = '' OR tq.bills_money_bag_id IS NULL OR tq.bills_money_bag_id = '')
      {year_filter}
    ORDER BY tq.comptage DESC
"""


@router.get("", response_model=EtatsTroncsResponse)
async def get_etats_troncs(
    request: FastAPIRequest,
    status_param: TroncStatus = Query(..., alias="status", description="État du tronc: prepared | collecting | uncounted | counted"),
    year: Optional[int] = Query(default=None, description="Année (défaut: année courante, 0=toutes)"),
    db: Session = Depends(get_rcq_db),
) -> EtatsTroncsResponse:
    """Return troncs matching the requested state."""
    user = get_authenticated_user(request, db)
    check_role(user, ROLES_COMPTEUR_AND_ABOVE)

    year_clause, year_params = _build_year_filter(year)

    if status_param == TroncStatus.missing_bags:
        # For missing_bags, use year filter on comptage date
        missing_year_clause = ""
        if year_params:
            missing_year_clause = "AND YEAR(tq.comptage) = :year"
        query = ETATS_TRONCS_MISSING_BAGS_QUERY.format(year_filter=missing_year_clause)
    elif status_param == TroncStatus.counted:
        # For counted troncs, use year filter on comptage date instead of depart
        counted_year_clause = ""
        if year_params:
            counted_year_clause = "AND YEAR(tq.comptage) = :year"
        query = ETATS_TRONCS_COUNTED_QUERY.format(year_filter=counted_year_clause)
    else:
        status_clause = STATUS_FILTERS[status_param]
        query = ETATS_TRONCS_QUERY.format(status_filter=status_clause, year_filter=year_clause)
    params = {"ul_id": user["ul_id"], **year_params}

    rows = db.execute(text(query), params).mappings().all()
    troncs = [TroncEtatDetail(**row) for row in rows]
    return EtatsTroncsResponse(troncs=troncs)

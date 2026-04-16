"""Stats journalières endpoint — daily statistics with Valkey cache."""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..cache import cache_delete, cache_get, cache_set
from ..database import get_rcq_db
from ..routers.auth import get_authenticated_user
from ..roles import ROLES_COMPTEUR_AND_ABOVE, check_role
from ..schemas.stats_journalieres import DailyStats, StatsJournalieresResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["stats-journalieres"])

# Cache TTLs
TTL_PAST_YEAR = 31_536_000  # 1 year in seconds
TTL_CURRENT_YEAR = 60  # 60 seconds

# ---------------------------------------------------------------------------
# SQL — Daily statistics from v_tronc_queteur_enriched only
# ---------------------------------------------------------------------------
STATS_QUERY = """
SELECT
  DATEDIFF(DATE(tqe.depart), qd.start_date) + 1 AS jour_num,
  ROUND(SUM(tqe.total_amount), 2) AS montant_jour,
  ROUND(SUM(tqe.dons_cb_total), 2) AS montant_cb,
  COUNT(DISTINCT tqe.queteur_id) AS nb_benevoles,
  COUNT(DISTINCT CASE WHEN q.secteur = 3 THEN tqe.queteur_id END) AS nb_benevoles_1j,
  ROUND(SUM(CASE WHEN tqe.duration_minutes >= 30 THEN tqe.duration_minutes ELSE 0 END) / 60.0, 1) AS nb_heures
FROM v_tronc_queteur_enriched tqe
JOIN queteur q ON tqe.queteur_id = q.id
JOIN quete_dates qd ON qd.year = YEAR(tqe.depart)
WHERE tqe.ul_id = :ul_id
  AND YEAR(tqe.depart) = :year
  AND DATEDIFF(DATE(tqe.depart), qd.start_date) + 1 BETWEEN 1 AND 9
GROUP BY jour_num
ORDER BY jour_num
"""

# ---------------------------------------------------------------------------
# SQL — Available years
# ---------------------------------------------------------------------------
AVAILABLE_YEARS_QUERY = """
SELECT DISTINCT YEAR(depart) AS year
FROM v_tronc_queteur_enriched
WHERE ul_id = :ul_id
ORDER BY 1 DESC
"""



@router.get("/stats-journalieres", response_model=StatsJournalieresResponse)
async def get_stats_journalieres(
    request: Request,
    year: int = Query(default=None, description="Year to query (defaults to current year)"),
    refresh: bool = Query(default=False, description="Force cache refresh"),
    db: Session = Depends(get_rcq_db),
) -> StatsJournalieresResponse:
    """Return daily statistics for the requested year.

    Results are cached per ul_id and year in Valkey.
    Past years use a 1-year TTL; the current year uses 60 s.
    """
    user = get_authenticated_user(request, db)
    check_role(user, ROLES_COMPTEUR_AND_ABOVE)
    ul_id = user["ul_id"]

    current_year = datetime.now().year
    if year is None:
        year = current_year

    is_current = year == current_year
    cache_key = f"stats_journalieres:{ul_id}:{year}"

    # --- Cache handling ---
    if refresh:
        cache_delete(cache_key)
        cached = None
    else:
        cached = cache_get(cache_key)

    if cached is not None:
        return StatsJournalieresResponse(**cached)

    # --- Query daily stats ---
    rows = (
        db.execute(text(STATS_QUERY), {"ul_id": ul_id, "year": year})
        .mappings()
        .all()
    )
    data = [
        DailyStats(
            jour_num=int(r["jour_num"]),
            montant_jour=float(r["montant_jour"]),
            montant_cb=float(r["montant_cb"]),
            nb_benevoles=int(r["nb_benevoles"]),
            nb_benevoles_1j=int(r["nb_benevoles_1j"]),
            nb_heures=float(r["nb_heures"]),
        )
        for r in rows
    ]

    # --- Query available years ---
    year_rows = (
        db.execute(text(AVAILABLE_YEARS_QUERY), {"ul_id": ul_id})
        .mappings()
        .all()
    )
    available_years = [int(r["year"]) for r in year_rows]
    if current_year not in available_years:
        available_years.insert(0, current_year)

    result = StatsJournalieresResponse(
        data=data,
        year=year,
        available_years=available_years,
    )

    # --- Store in cache ---
    ttl = TTL_CURRENT_YEAR if is_current else TTL_PAST_YEAR
    cache_set(cache_key, result.model_dump(), ttl_seconds=ttl)

    return result

"""Dashboard Super Admin endpoints — global KPIs across the whole database."""
import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..cache import cache_get, cache_set
from ..database import get_rcq_db
from ..routers.auth import get_authenticated_user
from ..roles import ROLES_SUPER_ADMIN_ONLY, check_role_real
from ..schemas.dashboard_admin import GlobalKPIs, YearlyStats, YearlyStatsResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dashboard-admin", tags=["dashboard-admin"])

# Cache TTL: 10 minutes
CACHE_TTL = 600

CACHE_KEY_GLOBAL_KPIS = "dashboard_admin:global_kpis"
CACHE_KEY_YEARLY_STATS = "dashboard_admin:yearly_stats"

# ---------------------------------------------------------------------------
# Shared metric expressions
# ---------------------------------------------------------------------------
_METRICS_SELECT = """
  COUNT(DISTINCT ul_id) AS nb_ul,
  COUNT(DISTINCT queteur_id) AS nb_queteurs,
  ROUND(SUM(duration_minutes) / 60.0) AS total_heures,
  ROUND(SUM(total_amount), 2) AS total_euros,
  ROUND(SUM(
      COALESCE(euro2, 0) * 2 + COALESCE(euro1, 0) * 1 +
      COALESCE(cents50, 0) * 0.5 + COALESCE(cents20, 0) * 0.2 +
      COALESCE(cents10, 0) * 0.1 + COALESCE(cents5, 0) * 0.05 +
      COALESCE(cents2, 0) * 0.02 + COALESCE(cent1, 0) * 0.01
  ), 2) AS total_pieces_euros,
  ROUND(SUM(
      COALESCE(euro500, 0) * 500 + COALESCE(euro200, 0) * 200 +
      COALESCE(euro100, 0) * 100 + COALESCE(euro50, 0) * 50 +
      COALESCE(euro20, 0) * 20 + COALESCE(euro10, 0) * 10 +
      COALESCE(euro5, 0) * 5
  ), 2) AS total_billets_euros,
  ROUND(SUM(COALESCE(dons_cb_total, 0)), 2) AS total_cb_euros
"""

GLOBAL_KPIS_QUERY = f"""
SELECT
{_METRICS_SELECT}
FROM v_tronc_queteur_enriched
WHERE total_amount > 0
"""

YEARLY_STATS_QUERY = f"""
SELECT
  YEAR(depart) AS year,
{_METRICS_SELECT}
FROM v_tronc_queteur_enriched
WHERE total_amount > 0
GROUP BY YEAR(depart)
ORDER BY year ASC
"""


def _row_to_global_kpis(row) -> GlobalKPIs:
    return GlobalKPIs(
        nb_ul=int(row["nb_ul"] or 0),
        nb_queteurs=int(row["nb_queteurs"] or 0),
        total_heures=int(row["total_heures"] or 0),
        total_euros=float(row["total_euros"] or 0),
        total_pieces_euros=float(row["total_pieces_euros"] or 0),
        total_billets_euros=float(row["total_billets_euros"] or 0),
        total_cb_euros=float(row["total_cb_euros"] or 0),
    )


def _row_to_yearly_stats(row) -> YearlyStats:
    return YearlyStats(
        year=int(row["year"]),
        nb_ul=int(row["nb_ul"] or 0),
        nb_queteurs=int(row["nb_queteurs"] or 0),
        total_heures=int(row["total_heures"] or 0),
        total_euros=float(row["total_euros"] or 0),
        total_pieces_euros=float(row["total_pieces_euros"] or 0),
        total_billets_euros=float(row["total_billets_euros"] or 0),
        total_cb_euros=float(row["total_cb_euros"] or 0),
    )


@router.get("/global-kpis", response_model=GlobalKPIs)
async def get_global_kpis(
    request: Request,
    db: Session = Depends(get_rcq_db),
) -> GlobalKPIs:
    """Return global KPIs aggregated across the whole database.

    Super Admin only — uses the real role so role overrides don't block access.
    """
    user = get_authenticated_user(request, db)
    check_role_real(user, ROLES_SUPER_ADMIN_ONLY)

    cached = cache_get(CACHE_KEY_GLOBAL_KPIS)
    if cached is not None:
        return GlobalKPIs(**cached)

    row = db.execute(text(GLOBAL_KPIS_QUERY)).mappings().first()
    result = _row_to_global_kpis(row) if row else GlobalKPIs(
        nb_ul=0, nb_queteurs=0, total_heures=0,
        total_euros=0, total_pieces_euros=0,
        total_billets_euros=0, total_cb_euros=0,
    )

    cache_set(CACHE_KEY_GLOBAL_KPIS, result.model_dump(), ttl_seconds=CACHE_TTL)
    return result


@router.get("/yearly-stats", response_model=YearlyStatsResponse)
async def get_yearly_stats(
    request: Request,
    db: Session = Depends(get_rcq_db),
) -> YearlyStatsResponse:
    """Return the same metrics broken down by year (ASC).

    Super Admin only — uses the real role so role overrides don't block access.
    """
    user = get_authenticated_user(request, db)
    check_role_real(user, ROLES_SUPER_ADMIN_ONLY)

    cached = cache_get(CACHE_KEY_YEARLY_STATS)
    if cached is not None:
        return YearlyStatsResponse(**cached)

    rows = db.execute(text(YEARLY_STATS_QUERY)).mappings().all()
    years = [_row_to_yearly_stats(r) for r in rows]
    result = YearlyStatsResponse(years=years)

    cache_set(CACHE_KEY_YEARLY_STATS, result.model_dump(), ttl_seconds=CACHE_TTL)
    return result

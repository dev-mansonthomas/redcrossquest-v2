"""Répartition journalière endpoint — daily (non-cumulated) amounts with Valkey cache."""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..cache import cache_delete, cache_get, cache_set
from ..database import get_rcq_db
from ..routers.auth import get_authenticated_user
from ..schemas.repartition_jours import DailyAmount, RepartitionJoursResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["repartition-jours"])

# Roles allowed: 3 (trésorier), 4 (admin UL) and 9 (super admin)
ALLOWED_ROLES = {"3", "4", "9"}

# Cache TTLs
TTL_PAST_YEAR = 31_536_000  # 1 year in seconds
TTL_CURRENT_YEAR = 60  # 60 seconds

# ---------------------------------------------------------------------------
# SQL — Non-cumulated daily amounts per year (all years, filtered by ul_id)
# ---------------------------------------------------------------------------
DAILY_AMOUNTS_QUERY = """
WITH daily_amounts AS (
    SELECT tqe.ul_id,
           YEAR(tqe.depart) AS year,
           DATEDIFF(DATE(tqe.depart), qd.start_date) + 1 AS jour_num,
           SUM(tqe.total_amount) AS montant_jour
    FROM v_tronc_queteur_enriched tqe
    JOIN quete_dates qd ON qd.year = YEAR(tqe.depart)
    WHERE DATEDIFF(DATE(tqe.depart), qd.start_date) + 1 BETWEEN 1 AND 9
      AND tqe.ul_id = :ul_id
    GROUP BY tqe.ul_id, YEAR(tqe.depart), jour_num

    UNION ALL

    SELECT dsb.ul_id,
           YEAR(dsb.date) AS year,
           DATEDIFF(dsb.date, qd.start_date) + 1 AS jour_num,
           dsb.amount AS montant_jour
    FROM daily_stats_before_rcq dsb
    JOIN quete_dates qd ON qd.year = YEAR(dsb.date)
    WHERE DATEDIFF(dsb.date, qd.start_date) + 1 BETWEEN 1 AND 9
      AND dsb.ul_id = :ul_id
)
SELECT year, jour_num, ROUND(SUM(montant_jour), 2) AS montant_jour
FROM daily_amounts
GROUP BY year, jour_num
ORDER BY year, jour_num
"""


def _check_role(user: dict) -> None:
    """Raise 403 if the user role is not allowed."""
    if str(user.get("role")) not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux rôles trésorier, admin ou super admin",
        )


@router.get("/repartition-jours", response_model=RepartitionJoursResponse)
async def get_repartition_jours(
    request: Request,
    refresh: bool = Query(default=False, description="Force cache refresh"),
    db: Session = Depends(get_rcq_db),
) -> RepartitionJoursResponse:
    """Return non-cumulated daily amounts for all available years.

    Results are cached per ul_id in Valkey.
    The single-query approach returns all years at once; we cache
    the entire result with a short TTL (60s) since it includes the
    current year data.
    """
    user = get_authenticated_user(request, db)
    _check_role(user)
    ul_id = user["ul_id"]

    current_year = datetime.now().year
    cache_key = f"repartition_jours:{ul_id}"

    if refresh:
        cache_delete(cache_key)
        cached = None
    else:
        cached = cache_get(cache_key)

    if cached is not None:
        return RepartitionJoursResponse(**cached)

    # Execute the query — returns all years in one go
    rows = (
        db.execute(text(DAILY_AMOUNTS_QUERY), {"ul_id": ul_id})
        .mappings()
        .all()
    )

    data = [
        {
            "year": int(r["year"]),
            "jour_num": int(r["jour_num"]),
            "montant_jour": float(r["montant_jour"]),
        }
        for r in rows
    ]

    # Derive min/max year from the data
    years = [d["year"] for d in data]
    min_year = min(years) if years else current_year
    max_year = max(years) if years else current_year

    result = RepartitionJoursResponse(
        data=[DailyAmount(**d) for d in data],
        min_year=min_year,
        max_year=max_year,
        current_year=current_year,
    )

    # Cache: historical data doesn't change, use long TTL (refresh button allows force-refresh)
    cache_set(cache_key, result.model_dump(), ttl_seconds=TTL_PAST_YEAR)

    return result

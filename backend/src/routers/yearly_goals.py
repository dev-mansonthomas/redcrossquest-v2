"""Yearly Goals endpoint — Objectif vs Réalisé with Valkey cache."""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..cache import cache_delete, cache_get, cache_set
from ..database import get_rcq_db
from ..routers.auth import get_authenticated_user
from ..roles import ROLES_COMPTEUR_AND_ABOVE, check_role
from ..schemas.yearly_goals import YearlyGoalDataPoint, YearlyGoalsResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["yearly-goals"])

# Cache TTLs
TTL_PAST_YEAR = 31_536_000  # 1 year in seconds
TTL_CURRENT_YEAR = 60  # 60 seconds

# ---------------------------------------------------------------------------
# SQL — Réalisé daily amounts per year (filtered by ul_id)
# ---------------------------------------------------------------------------
REALISE_QUERY = """
WITH realise_daily AS (
    SELECT tqe.ul_id,
           YEAR(tqe.depart) AS year,
           DATEDIFF(DATE(tqe.depart), qd.start_date) + 1 AS jour_num,
           SUM(tqe.total_amount) AS montant_jour
    FROM v_tronc_queteur_enriched tqe
    JOIN quete_dates qd ON qd.year = YEAR(tqe.depart)
    WHERE DATEDIFF(DATE(tqe.depart), qd.start_date) + 1 BETWEEN 1 AND 9
      AND YEAR(tqe.depart) = :year
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
      AND YEAR(dsb.date) = :year
      AND dsb.ul_id = :ul_id
)
SELECT ul_id,
       year,
       jour_num,
       'Réalisé' AS serie,
       ROUND(SUM(SUM(montant_jour)) OVER (
           PARTITION BY ul_id, year ORDER BY jour_num
       ), 2) AS montant_cumule
FROM realise_daily
GROUP BY ul_id, year, jour_num
ORDER BY jour_num
"""

# ---------------------------------------------------------------------------
# SQL — Objectif (current year only)
# ---------------------------------------------------------------------------
OBJECTIF_QUERY = """
SELECT ul_id, year, amount,
       day_1_percentage, day_2_percentage, day_3_percentage,
       day_4_percentage, day_5_percentage, day_6_percentage,
       day_7_percentage, day_8_percentage, day_9_percentage
FROM yearly_goal
WHERE year = :year
  AND ul_id = :ul_id
"""



def _build_objectif_series(row: dict) -> list[dict]:
    """Expand a yearly_goal row into 9 cumulative data points."""
    percentages = [
        row["day_1_percentage"],
        row["day_2_percentage"],
        row["day_3_percentage"],
        row["day_4_percentage"],
        row["day_5_percentage"],
        row["day_6_percentage"],
        row["day_7_percentage"],
        row["day_8_percentage"],
        row["day_9_percentage"],
    ]
    amount = float(row["amount"])
    year = int(row["year"])
    ul_id = int(row["ul_id"])
    serie = "Objectif"

    cumul = 0.0
    points: list[dict] = []
    for day_num, pct in enumerate(percentages, start=1):
        cumul += float(pct or 0)
        points.append({
            "year": year,
            "jour_num": day_num,
            "serie": serie,
            "montant_cumule": round(amount * cumul / 100, 2),
        })
    return points


@router.get("/yearly-goals", response_model=YearlyGoalsResponse)
async def get_yearly_goals(
    request: Request,
    refresh: bool = Query(default=False, description="Force cache refresh"),
    db: Session = Depends(get_rcq_db),
) -> YearlyGoalsResponse:
    """Return Objectif vs Réalisé series for the last 6 years (N-5 to N).

    Results are cached per ul_id and year in Valkey.
    Past years use a 1-year TTL; the current year uses 60 s.
    """
    user = get_authenticated_user(request, db)
    check_role(user, ROLES_COMPTEUR_AND_ABOVE)
    ul_id = user["ul_id"]

    current_year = datetime.now().year
    all_data: list[dict] = []

    # --- Réalisé series for N-5 .. N ---
    for year in range(current_year - 5, current_year + 1):
        cache_key = f"yearly_goals:{ul_id}:{year}"
        is_current = year == current_year

        if refresh:
            cache_delete(cache_key)
            cached = None
        else:
            cached = cache_get(cache_key)

        if cached is not None:
            all_data.extend(cached)
        else:
            rows = (
                db.execute(text(REALISE_QUERY), {"ul_id": ul_id, "year": year})
                .mappings()
                .all()
            )
            year_data = [
                {
                    "year": int(r["year"]),
                    "jour_num": int(r["jour_num"]),
                    "serie": r["serie"],
                    "montant_cumule": float(r["montant_cumule"]),
                }
                for r in rows
            ]
            # Cache with appropriate TTL
            ttl = TTL_CURRENT_YEAR if is_current else TTL_PAST_YEAR
            if year_data:
                cache_set(cache_key, year_data, ttl_seconds=ttl)
            all_data.extend(year_data)

    # --- Objectif series (current year) ---
    objectif_cache_key = f"yearly_goals_obj:{ul_id}:{current_year}"
    if refresh:
        cache_delete(objectif_cache_key)
        cached_obj = None
    else:
        cached_obj = cache_get(objectif_cache_key)

    if cached_obj is not None:
        all_data.extend(cached_obj)
    else:
        goal_row = (
            db.execute(
                text(OBJECTIF_QUERY), {"ul_id": ul_id, "year": current_year}
            )
            .mappings()
            .first()
        )
        if goal_row:
            obj_data = _build_objectif_series(dict(goal_row))
            cache_set(objectif_cache_key, obj_data, ttl_seconds=TTL_CURRENT_YEAR)
            all_data.extend(obj_data)

    # Build response
    data_points = [YearlyGoalDataPoint(**d) for d in all_data]
    return YearlyGoalsResponse(data=data_points)

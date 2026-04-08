"""Map endpoints for quêteur geolocation."""
from fastapi import APIRouter, Depends, Request as FastAPIRequest
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_rcq_db
from ..schemas.map import (
    ActiveQueteur,
    ActiveQueteursResponse,
    AvailableYearsResponse,
    PointQuete,
    PointQueteStats,
    PointsQueteResponse,
    PointsQueteStatsResponse,
)
from .auth import get_authenticated_user

router = APIRouter(prefix="/api/map", tags=["map"])

ACTIVE_QUETEURS_QUERY = """
    SELECT
        q.first_name, q.last_name, q.man,
        pq.latitude, pq.longitude, pq.name AS point_name, pq.address,
        tq.depart,
        tq.point_quete_id,
        pq.code AS point_code
    FROM tronc_queteur tq
    JOIN queteur q ON q.id = tq.queteur_id
    JOIN point_quete pq ON pq.id = tq.point_quete_id
    WHERE tq.deleted = 0
      AND tq.depart IS NOT NULL
      AND tq.retour IS NULL
      AND tq.ul_id = :ul_id
"""


@router.get("/active-queteurs", response_model=ActiveQueteursResponse)
async def get_active_queteurs(
    request: FastAPIRequest,
    db: Session = Depends(get_rcq_db),
) -> ActiveQueteursResponse:
    """Return quêteurs currently out collecting, filtered by the user's ul_id."""
    user = get_authenticated_user(request, db)
    ul_id = user["ul_id"]

    rows = db.execute(text(ACTIVE_QUETEURS_QUERY), {"ul_id": ul_id}).mappings().all()

    queteurs = [ActiveQueteur(**row) for row in rows]
    return ActiveQueteursResponse(queteurs=queteurs)


POINTS_QUETE_QUERY = """
    SELECT pq.id, pq.name, pq.latitude, pq.longitude, pq.address, pq.type, pq.code
    FROM point_quete pq
    WHERE pq.ul_id = :ul_id
      AND pq.enabled = 1
"""


@router.get("/points-quete", response_model=PointsQueteResponse)
async def get_points_quete(
    request: FastAPIRequest,
    db: Session = Depends(get_rcq_db),
) -> PointsQueteResponse:
    """Return all enabled points de quête for the user's UL."""
    user = get_authenticated_user(request, db)
    ul_id = user["ul_id"]

    rows = db.execute(text(POINTS_QUETE_QUERY), {"ul_id": ul_id}).mappings().all()

    points = [PointQuete(**row) for row in rows]
    return PointsQueteResponse(points_quete=points)


AVAILABLE_YEARS_QUERY = """
    SELECT DISTINCT YEAR(tqe.depart) as year
    FROM v_tronc_queteur_enriched tqe
    WHERE tqe.ul_id = :ul_id
    ORDER BY year DESC
"""


@router.get("/available-years", response_model=AvailableYearsResponse)
async def get_available_years(
    request: FastAPIRequest,
    db: Session = Depends(get_rcq_db),
) -> AvailableYearsResponse:
    """Return distinct years with collection data for the user's UL."""
    user = get_authenticated_user(request, db)
    ul_id = user["ul_id"]

    rows = db.execute(text(AVAILABLE_YEARS_QUERY), {"ul_id": ul_id}).mappings().all()
    years = [row["year"] for row in rows]
    return AvailableYearsResponse(years=years)


@router.get("/points-quete-stats", response_model=PointsQueteStatsResponse)
async def get_points_quete_stats(
    request: FastAPIRequest,
    years: str = "",
    db: Session = Depends(get_rcq_db),
) -> PointsQueteStatsResponse:
    """Return aggregated stats per point de quête, filtered by years."""
    from datetime import datetime

    user = get_authenticated_user(request, db)
    ul_id = user["ul_id"]

    # Parse years parameter; default to last 5 years
    if years and years.strip():
        years_list = [int(y.strip()) for y in years.split(",") if y.strip()]
    else:
        current_year = datetime.now().year
        years_list = list(range(current_year - 4, current_year + 1))

    # Build dynamic placeholders for IN clause
    placeholders = ", ".join([f":year_{i}" for i in range(len(years_list))])
    params: dict = {"ul_id": ul_id}
    params.update({f"year_{i}": y for i, y in enumerate(years_list)})

    query = f"""
        SELECT
            pq.id, pq.name, pq.code, pq.latitude, pq.longitude, pq.type, pq.address,
            COALESCE(stats.total_amount, 0) as total_amount,
            COALESCE(stats.total_hours, 0) as total_hours,
            COALESCE(stats.tronc_count, 0) as tronc_count,
            CASE WHEN COALESCE(stats.total_hours, 0) > 0
                 THEN ROUND(stats.total_amount / stats.total_hours, 2)
                 ELSE 0
            END as hourly_rate,
            COALESCE(active.active_count, 0) as active_queteurs
        FROM point_quete pq
        LEFT JOIN (
            SELECT point_quete_id,
                SUM(total_amount) as total_amount,
                SUM(CASE WHEN duration_minutes >= 30 THEN duration_minutes ELSE 0 END) / 60.0 as total_hours,
                COUNT(*) as tronc_count
            FROM v_tronc_queteur_enriched
            WHERE ul_id = :ul_id AND YEAR(depart) IN ({placeholders})
            GROUP BY point_quete_id
        ) stats ON stats.point_quete_id = pq.id
        LEFT JOIN (
            SELECT point_quete_id, COUNT(*) as active_count
            FROM tronc_queteur
            WHERE deleted = 0 AND depart IS NOT NULL AND retour IS NULL AND ul_id = :ul_id
            GROUP BY point_quete_id
        ) active ON active.point_quete_id = pq.id
        WHERE pq.ul_id = :ul_id AND pq.enabled = 1
    """

    rows = db.execute(text(query), params).mappings().all()
    points = [PointQueteStats(**row) for row in rows]
    return PointsQueteStatsResponse(points_quete=points)

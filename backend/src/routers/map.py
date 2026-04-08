"""Map endpoints for quêteur geolocation."""
from fastapi import APIRouter, Depends, Request as FastAPIRequest
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_rcq_db
from ..schemas.map import ActiveQueteur, ActiveQueteursResponse, PointQuete, PointsQueteResponse
from .auth import get_authenticated_user

router = APIRouter(prefix="/api/map", tags=["map"])

ACTIVE_QUETEURS_QUERY = """
    SELECT
        q.first_name, q.last_name,
        pq.latitude, pq.longitude, pq.name AS point_name, pq.address,
        tq.depart,
        tq.point_quete_id
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
    SELECT pq.id, pq.name, pq.latitude, pq.longitude, pq.address
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

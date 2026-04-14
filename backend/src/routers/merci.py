"""Merci endpoint — Public thank-you page for quêteurs."""
import logging
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..cache import cache_get, cache_set
from ..database import get_rcq_db
from ..schemas.merci import MerciResponse, MerciStats, PointQueteMerci

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["merci"])

UUID_V4_REGEX = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    re.IGNORECASE,
)

CACHE_TTL = 5_184_000  # 2 months in seconds

# ---------------------------------------------------------------------------
# SQL queries
# ---------------------------------------------------------------------------
QUETEUR_QUERY = """
SELECT id, first_name, man, secteur, ul_id
FROM queteur
WHERE spotfire_access_token = :uuid
"""

UPDATE_MAILING_STATUS_QUERY = """
UPDATE queteur_mailing_status
SET spotfire_opened = spotfire_opened + 1,
    spotfire_open_date = CASE WHEN spotfire_open_date IS NULL THEN NOW() ELSE spotfire_open_date END
WHERE queteur_id = :queteur_id AND year = :year
"""

POINTS_QUETE_QUERY = """
SELECT pq.id, pq.name, pq.latitude, pq.longitude, pq.address, pq.type,
       SUM(tqe.total_amount) AS total_amount,
       ROUND(SUM(tqe.duration_minutes) / 60.0, 2) AS total_hours,
       ROUND(SUM(tqe.weight), 0) AS total_weight_grams,
       COUNT(*) AS tronc_count
FROM v_tronc_queteur_enriched tqe
JOIN point_quete pq ON pq.id = tqe.point_quete_id
WHERE tqe.queteur_id = :queteur_id
  AND YEAR(tqe.depart) = :year
GROUP BY pq.id, pq.name, pq.latitude, pq.longitude, pq.address, pq.type
"""

THANKS_MESSAGE_QUERY = """
SELECT us.thanks_mail_benevole, us.thanks_mail_benevole1j,
       u.name AS ul_name, u.president_man, u.president_first_name, u.president_last_name
FROM ul_settings us
JOIN ul u ON u.id = us.ul_id
WHERE us.ul_id = :ul_id
"""


@router.get("/merci/{uuid}", response_model=MerciResponse)
async def get_merci(
    uuid: str,
    year: int = Query(default=None, description="Year to display (defaults to current year)"),
    db: Session = Depends(get_rcq_db),
) -> MerciResponse:
    """Public endpoint — return personal results for a quêteur (no auth)."""

    # 1. Validate UUID v4 format
    if not UUID_V4_REGEX.match(uuid):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="UUID invalide",
        )

    current_year = datetime.now().year
    if year is None:
        year = current_year

    # 2. Look up quêteur
    row = db.execute(text(QUETEUR_QUERY), {"uuid": uuid}).mappings().first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quêteur non trouvé",
        )
    queteur = dict(row)
    queteur_id = queteur["id"]

    # 3. Update mailing status (always, before cache check)
    db.execute(
        text(UPDATE_MAILING_STATUS_QUERY),
        {"queteur_id": queteur_id, "year": year},
    )
    db.commit()

    # 4. Cache check
    cache_key = f"merci:{uuid}:{year}"
    cached = cache_get(cache_key)
    if cached is not None:
        return MerciResponse(**cached)

    # 5. Query stats per point_quete
    pq_rows = (
        db.execute(text(POINTS_QUETE_QUERY), {"queteur_id": queteur_id, "year": year})
        .mappings()
        .all()
    )

    points_quete = [
        PointQueteMerci(
            id=int(r["id"]),
            name=r["name"],
            latitude=float(r["latitude"]) if r["latitude"] is not None else None,
            longitude=float(r["longitude"]) if r["longitude"] is not None else None,
            address=r["address"],
            type=int(r["type"]) if r["type"] is not None else 1,
            total_amount=float(r["total_amount"]),
        )
        for r in pq_rows
    ]

    # Aggregate stats
    total_amount = sum(p.total_amount for p in points_quete)
    total_hours = sum(float(r["total_hours"] or 0) for r in pq_rows)
    total_weight_grams = sum(float(r["total_weight_grams"] or 0) for r in pq_rows)
    tronc_count = sum(int(r["tronc_count"]) for r in pq_rows)

    stats = MerciStats(
        total_amount=round(total_amount, 2),
        total_hours=round(total_hours, 2),
        total_weight_grams=round(total_weight_grams, 0),
        tronc_count=tronc_count,
    )

    # 6. Thanks message
    thanks_row = db.execute(text(THANKS_MESSAGE_QUERY), {"ul_id": queteur["ul_id"]}).mappings().first()
    thanks_message = None
    ul_name = None
    president_title = None
    president_first_name = None
    president_last_name = None
    if thanks_row:
        secteur = queteur.get("secteur")
        if secteur in (1, 2):
            thanks_message = thanks_row["thanks_mail_benevole"]
        else:
            thanks_message = thanks_row["thanks_mail_benevole1j"]
        ul_name = thanks_row.get("ul_name")
        president_title = "Mr" if thanks_row.get("president_man") else "Mme"
        president_first_name = thanks_row.get("president_first_name")
        president_last_name = thanks_row.get("president_last_name")

    # Available years
    available_years = list(range(current_year, current_year - 10, -1))

    response = MerciResponse(
        queteur_first_name=queteur["first_name"],
        queteur_man=bool(queteur["man"]),
        thanks_message=thanks_message,
        ul_name=ul_name,
        president_title=president_title,
        president_first_name=president_first_name,
        president_last_name=president_last_name,
        year=year,
        available_years=available_years,
        stats=stats,
        points_quete=points_quete,
    )

    # Cache the result
    cache_set(cache_key, response.model_dump(), ttl_seconds=CACHE_TTL)

    return response

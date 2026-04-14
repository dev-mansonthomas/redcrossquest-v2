"""Mailing stats endpoint — Suivi mail remerciement."""
import logging
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_rcq_db
from ..routers.auth import get_authenticated_user
from ..schemas.mailing_stats import (
    CumulativeOpenPoint,
    MailingStatsEntry,
    MailingStatsResponse,
    SummaryBySecteur,
    SummaryByStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["mailing-stats"])

# Roles allowed: 4 (admin UL) and 9 (super admin)
ALLOWED_ROLES = {"4", "9"}

# Status code labels
STATUS_LABELS: dict[str, str] = {
    "202": "Accepted (envoyé)",
    "400": "Bad Request",
    "401": "Unauthorized",
    "403": "Forbidden",
    "413": "Payload Too Large",
    "429": "Too Many Requests",
    "500": "Internal Server Error",
}

SECTEUR_CASE = """
    CASE
        WHEN q.secteur IN (1,2) THEN 'Bénévole'
        WHEN q.secteur = 3 THEN 'Bénévole d''un jour'
        WHEN q.secteur = 4 THEN 'Ancien bénévole'
        WHEN q.secteur = 5 THEN 'Commerçant'
        WHEN q.secteur = 6 THEN 'Spécial'
        ELSE 'Autre'
    END
"""

# ---------------------------------------------------------------------------
# SQL queries
# ---------------------------------------------------------------------------
CUMULATIVE_OPENS_QUERY = f"""
SELECT
    DATE(qms.spotfire_open_date) AS open_date,
    {SECTEUR_CASE} AS secteur_label,
    COUNT(*) AS daily_count
FROM queteur_mailing_status qms
JOIN queteur q ON q.id = qms.queteur_id
WHERE qms.year = :year
  AND q.ul_id = :ul_id
  AND qms.spotfire_open_date IS NOT NULL
GROUP BY DATE(qms.spotfire_open_date), secteur_label
ORDER BY open_date
"""

SUMMARY_BY_SECTEUR_QUERY = f"""
SELECT
    {SECTEUR_CASE} AS secteur_label,
    COUNT(*) AS count
FROM queteur_mailing_status qms
JOIN queteur q ON q.id = qms.queteur_id
WHERE qms.year = :year AND q.ul_id = :ul_id AND qms.spotfire_open_date IS NOT NULL
GROUP BY secteur_label
"""

SUMMARY_BY_STATUS_QUERY = """
SELECT qms.status_code, COUNT(*) AS count
FROM queteur_mailing_status qms
JOIN queteur q ON q.id = qms.queteur_id
WHERE qms.year = :year AND q.ul_id = :ul_id
GROUP BY qms.status_code
"""

TABLE_DATA_QUERY = """
SELECT qms.queteur_id, q.first_name, q.last_name, qms.email_send_date, qms.status_code
FROM queteur_mailing_status qms
JOIN queteur q ON q.id = qms.queteur_id
WHERE qms.year = :year AND q.ul_id = :ul_id
ORDER BY qms.email_send_date DESC
"""


def _check_role(user: dict) -> None:
    """Raise 403 if the user role is not allowed."""
    if str(user.get("role")) not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux rôles admin ou super admin",
        )


def _compute_cumulative_opens(rows: list[dict]) -> list[CumulativeOpenPoint]:
    """Compute cumulative counts per secteur_label across dates."""
    cumulative: dict[str, int] = defaultdict(int)
    result: list[CumulativeOpenPoint] = []
    for row in rows:
        label = row["secteur_label"]
        cumulative[label] += int(row["daily_count"])
        result.append(
            CumulativeOpenPoint(
                open_date=str(row["open_date"]),
                secteur_label=label,
                cumulative_count=cumulative[label],
            )
        )
    return result


@router.get("/mailing-stats", response_model=MailingStatsResponse)
async def get_mailing_stats(
    request: Request,
    year: int = Query(default=None, description="Year to filter on"),
    db: Session = Depends(get_rcq_db),
) -> MailingStatsResponse:
    """Return mailing stats for the given year."""
    user = get_authenticated_user(request, db)
    _check_role(user)
    ul_id = user["ul_id"]

    if year is None:
        year = datetime.now().year

    params = {"ul_id": ul_id, "year": year}

    # Available years – always propose the last 10 years regardless of data
    current_year = datetime.now().year
    available_years = list(range(current_year, current_year - 10, -1))

    # Cumulative opens
    open_rows = db.execute(text(CUMULATIVE_OPENS_QUERY), params).mappings().all()
    cumulative_opens = _compute_cumulative_opens([dict(r) for r in open_rows])

    # Summary by secteur
    secteur_rows = db.execute(text(SUMMARY_BY_SECTEUR_QUERY), params).mappings().all()
    summary_by_secteur = [SummaryBySecteur(**r) for r in secteur_rows]

    # Summary by status
    status_rows = db.execute(text(SUMMARY_BY_STATUS_QUERY), params).mappings().all()
    summary_by_status = [
        SummaryByStatus(
            status_code=str(r["status_code"]),
            label=STATUS_LABELS.get(str(r["status_code"]), str(r["status_code"])),
            count=int(r["count"]),
        )
        for r in status_rows
    ]

    # Table data
    table_rows = db.execute(text(TABLE_DATA_QUERY), params).mappings().all()
    table_data = [
        MailingStatsEntry(
            queteur_id=int(r["queteur_id"]),
            first_name=r["first_name"],
            last_name=r["last_name"],
            email_send_date=str(r["email_send_date"]) if r["email_send_date"] else "",
            status_code=str(r["status_code"]),
        )
        for r in table_rows
    ]

    return MailingStatsResponse(
        available_years=available_years,
        cumulative_opens=cumulative_opens,
        summary_by_secteur=summary_by_secteur,
        summary_by_status=summary_by_status,
        table_data=table_data,
    )

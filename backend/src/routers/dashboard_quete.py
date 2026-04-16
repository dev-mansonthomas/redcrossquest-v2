"""Dashboard quête endpoints — summary KPIs and top 10."""
from fastapi import APIRouter, Depends, Query, Request as FastAPIRequest
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_rcq_db
from ..roles import ROLES_ALL, check_role
from ..schemas.dashboard_quete import (
    ActiveQueteur,
    DashboardSummaryResponse,
    KPIs,
    Top10Response,
    TopQueteur,
)
from .auth import get_authenticated_user

router = APIRouter(prefix="/api/dashboard-quete", tags=["dashboard-quete"])


KPIS_COUNTED_QUERY = """
    SELECT
        COALESCE(SUM(tqe.duration_minutes), 0) AS total_temps_minutes,
        COUNT(DISTINCT tqe.queteur_id) AS nb_queteurs,
        COALESCE(SUM(tqe.total_amount), 0) AS montant_total
    FROM v_tronc_queteur_enriched tqe
    WHERE tqe.ul_id = :ul_id
      AND YEAR(tqe.depart) = YEAR(CURDATE())
      AND tqe.deleted = 0
      AND tqe.comptage IS NOT NULL
      AND tqe.total_amount > 0
"""

NB_SORTIES_QUERY = """
    SELECT COUNT(*) AS nb_sorties
    FROM tronc_queteur
    WHERE ul_id = :ul_id
      AND YEAR(COALESCE(depart, depart_theorique)) = YEAR(CURDATE())
      AND deleted = 0
"""

PUBLIC_DASHBOARD_QUERY = """
    SELECT publicDashboard FROM ul WHERE id = :ul_id
"""

ACTIVE_QUETEURS_QUERY = """
    SELECT
        q.first_name, q.last_name,
        pq.latitude, pq.longitude, pq.name AS point_name,
        tq.depart
    FROM tronc_queteur tq
    JOIN queteur q ON q.id = tq.queteur_id
    JOIN point_quete pq ON pq.id = tq.point_quete_id
    WHERE tq.deleted = 0
      AND tq.depart IS NOT NULL
      AND tq.retour IS NULL
      AND tq.ul_id = :ul_id
"""

# Whitelist for sort columns and directions (SQL injection prevention)
SORT_COLUMNS = {"montant": "montant", "temps": "temps_minutes", "sorties": "nb_sorties"}
SORT_DIRS = {"asc": "ASC", "desc": "DESC"}

TOP10_QUERY_TEMPLATE = """
    SELECT q.first_name, q.last_name,
           COALESCE(SUM(tqe.total_amount), 0) AS montant,
           COALESCE(SUM(tqe.duration_minutes), 0) AS temps_minutes,
           COUNT(*) AS nb_sorties
    FROM v_tronc_queteur_enriched tqe
    JOIN queteur q ON q.id = tqe.queteur_id
    WHERE tqe.ul_id = :ul_id
      AND DATE(tqe.depart) = CURDATE()
      AND tqe.deleted = 0
      AND tqe.comptage IS NOT NULL
    GROUP BY tqe.queteur_id, q.first_name, q.last_name
    ORDER BY {sort_col} {sort_dir}
    LIMIT 10
"""


def _get_show_montant(db: Session, ul_id: int) -> bool:
    """Check if the UL's publicDashboard setting allows showing amounts."""
    row = db.execute(text(PUBLIC_DASHBOARD_QUERY), {"ul_id": ul_id}).mappings().first()
    if row is None:
        return False
    return row["publicDashboard"] in ("RCQ-Public-MontantsVisibles", "MontantsVisibles")


@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_summary(
    request: FastAPIRequest,
    db: Session = Depends(get_rcq_db),
) -> DashboardSummaryResponse:
    """Return KPIs (current year) and currently active quêteurs."""
    user = get_authenticated_user(request, db)
    check_role(user, ROLES_ALL)
    ul_id = user["ul_id"]

    # KPIs
    kpi_row = db.execute(text(KPIS_COUNTED_QUERY), {"ul_id": ul_id}).mappings().first()
    sorties_row = db.execute(text(NB_SORTIES_QUERY), {"ul_id": ul_id}).mappings().first()
    show_montant = _get_show_montant(db, ul_id)

    kpis = KPIs(
        total_temps_minutes=int(kpi_row["total_temps_minutes"]),
        nb_queteurs=int(kpi_row["nb_queteurs"]),
        nb_sorties=int(sorties_row["nb_sorties"]),
        montant_total=float(kpi_row["montant_total"]),
        show_montant=show_montant,
    )

    # Active quêteurs
    rows = db.execute(text(ACTIVE_QUETEURS_QUERY), {"ul_id": ul_id}).mappings().all()
    active_queteurs = [ActiveQueteur(**row) for row in rows]

    return DashboardSummaryResponse(kpis=kpis, active_queteurs=active_queteurs)


@router.get("/top10", response_model=Top10Response)
async def get_top10(
    request: FastAPIRequest,
    sort: str = Query(default="montant", description="Colonne de tri"),
    dir: str = Query(default="desc", description="Direction du tri"),
    db: Session = Depends(get_rcq_db),
) -> Top10Response:
    """Return top 10 quêteurs of the day, sorted by the given column."""
    user = get_authenticated_user(request, db)
    check_role(user, ROLES_ALL)
    ul_id = user["ul_id"]

    sort_col = SORT_COLUMNS.get(sort, "montant")
    sort_dir = SORT_DIRS.get(dir, "DESC")

    query = TOP10_QUERY_TEMPLATE.format(sort_col=sort_col, sort_dir=sort_dir)
    rows = db.execute(text(query), {"ul_id": ul_id}).mappings().all()

    queteurs = [TopQueteur(**row) for row in rows]
    show_montant = _get_show_montant(db, ul_id)

    return Top10Response(queteurs=queteurs, show_montant=show_montant)

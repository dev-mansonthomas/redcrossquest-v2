"""UL (Unité Locale) search and overview endpoints."""
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..cache import cache_delete, cache_get, cache_set
from ..database import get_rcq_db
from ..routers.auth import get_authenticated_user
from ..schemas.ul import (
    ActivityYear,
    FinancialYear,
    HoursBySector,
    QueteursBySector,
    UlOverviewResponse,
    UlSearchResponse,
    UlSearchResult,
)
from ..schemas.ul_settings import UlSettingsResponse, UlSettingsUpdate

router = APIRouter(prefix="/api", tags=["ul"])

# Secteur labels — convention du projet
SECTEUR_LABELS: dict[int, str] = {
    1: "Bénévole",
    2: "Bénévole",
    3: "Bénévole d'un jour",
    4: "Ancien bénévole",
    5: "Commerçant",
    6: "Spécial",
}

# Roles allowed to access UL overview and settings
OVERVIEW_ALLOWED_ROLES = {"4", "9"}
SETTINGS_ALLOWED_ROLES = {"4", "9"}

# Cache TTL for UL overview (1 hour)
UL_OVERVIEW_CACHE_TTL = 3600

# Number of years to fetch
NUM_YEARS = 5


@router.get("/ul/search", response_model=UlSearchResponse)
async def search_ul(
    request: Request,
    q: str = Query(..., min_length=2, description="Search query (min 2 characters)"),
    db: Session = Depends(get_rcq_db),
) -> UlSearchResponse:
    """Search for ULs by name. Restricted to Super Admin (role=9)."""
    user_profile = get_authenticated_user(request, db)

    real_role = user_profile.get("real_role") or user_profile.get("role")
    if str(real_role) != "9":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé au Super Admin",
        )

    rows = db.execute(
        text(
            "SELECT id, name, postal_code FROM ul "
            "WHERE date_demarrage_rcq IS NOT NULL "
            "AND (name LIKE :q OR postal_code LIKE :q OR CAST(id AS CHAR) LIKE :q) "
            "ORDER BY name "
            "LIMIT 20"
        ),
        {"q": f"%{q}%"},
    ).mappings().all()

    results = [
        UlSearchResult(id=row["id"], name=row["name"], postal_code=row["postal_code"])
        for row in rows
    ]
    return UlSearchResponse(results=results)


# ---------------------------------------------------------------------------
# Vue globale UL — overview endpoint (multi-year)
# ---------------------------------------------------------------------------

FINANCIALS_QUERY = """
    SELECT
      YEAR(tqe.depart) AS year,
      ROUND(SUM(
        COALESCE(tqe.euro500, 0) * 500 + COALESCE(tqe.euro200, 0) * 200 +
        COALESCE(tqe.euro100, 0) * 100 + COALESCE(tqe.euro50, 0) * 50 +
        COALESCE(tqe.euro20, 0) * 20 + COALESCE(tqe.euro10, 0) * 10 +
        COALESCE(tqe.euro5, 0) * 5
      ), 2) AS total_billets,
      ROUND(SUM(
        COALESCE(tqe.euro2, 0) * 2 + COALESCE(tqe.euro1, 0) * 1 +
        COALESCE(tqe.cents50, 0) * 0.5 + COALESCE(tqe.cents20, 0) * 0.2 +
        COALESCE(tqe.cents10, 0) * 0.1 + COALESCE(tqe.cents5, 0) * 0.05 +
        COALESCE(tqe.cents2, 0) * 0.02 + COALESCE(tqe.cent1, 0) * 0.01
      ), 2) AS total_pieces,
      ROUND(SUM(COALESCE(tqe.don_creditcard, 0)), 2) AS total_cb,
      ROUND(SUM(COALESCE(tqe.don_cheque, 0)), 2) AS total_cheques
    FROM v_tronc_queteur_enriched tqe
    WHERE tqe.ul_id = :ul_id
      AND YEAR(tqe.depart) >= :min_year
      AND tqe.deleted = 0
      AND tqe.comptage IS NOT NULL
    GROUP BY YEAR(tqe.depart)
    ORDER BY year
"""

HOURS_BY_SECTOR_QUERY = """
    SELECT
      YEAR(tqe.depart) AS year,
      q.secteur,
      ROUND(SUM(tqe.duration_minutes) / 60.0, 2) AS total_hours
    FROM v_tronc_queteur_enriched tqe
    JOIN queteur q ON tqe.queteur_id = q.id
    JOIN point_quete pq ON tqe.point_quete_id = pq.id
    WHERE tqe.ul_id = :ul_id
      AND YEAR(tqe.depart) >= :min_year
      AND tqe.deleted = 0 AND tqe.comptage IS NOT NULL
      AND pq.type IN (1, 2)
    GROUP BY YEAR(tqe.depart), q.secteur
    ORDER BY year, q.secteur
"""

QUETEURS_BY_SECTOR_QUERY = """
    SELECT
      YEAR(tqe.depart) AS year,
      q.secteur,
      COUNT(DISTINCT tqe.queteur_id) AS nb_queteurs
    FROM v_tronc_queteur_enriched tqe
    JOIN queteur q ON tqe.queteur_id = q.id
    WHERE tqe.ul_id = :ul_id
      AND YEAR(tqe.depart) >= :min_year
      AND tqe.deleted = 0 AND tqe.comptage IS NOT NULL
      AND tqe.total_amount > 0
    GROUP BY YEAR(tqe.depart), q.secteur
    ORDER BY year, q.secteur
"""

ACTIVITY_QUERY = """
    SELECT
      YEAR(tqe.depart) AS year,
      COUNT(*) AS nb_tronc_queteur,
      COUNT(DISTINCT tqe.point_quete_id) AS nb_points_quete,
      COUNT(DISTINCT tqe.tronc_id) AS nb_troncs
    FROM v_tronc_queteur_enriched tqe
    WHERE tqe.ul_id = :ul_id
      AND YEAR(tqe.depart) >= :min_year
      AND tqe.deleted = 0 AND tqe.comptage IS NOT NULL
    GROUP BY YEAR(tqe.depart)
    ORDER BY year
"""


def _check_overview_role(user: dict) -> None:
    """Raise 403 if the user role is not allowed."""
    if str(user.get("role")) not in OVERVIEW_ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux rôles admin ou super admin",
        )


@router.get("/ul/overview", response_model=UlOverviewResponse)
async def get_ul_overview(
    request: Request,
    refresh: bool = Query(default=False, description="Force cache refresh"),
    db: Session = Depends(get_rcq_db),
) -> UlOverviewResponse:
    """Return a multi-year overview of the UL's quête activity.

    Returns the last 5 years of data for 4 chart types.
    Results are cached in Valkey for 1 hour.
    """
    user = get_authenticated_user(request, db)
    _check_overview_role(user)
    ul_id = user["ul_id"]

    cache_key = f"rcq:ul_overview:{ul_id}"

    # --- Invalidate cache if refresh requested ---
    if refresh:
        cache_delete(cache_key)
    else:
        cached = cache_get(cache_key)
        if cached is not None:
            return UlOverviewResponse(**cached)

    current_year = datetime.now().year
    min_year = current_year - NUM_YEARS + 1
    years = list(range(min_year, current_year + 1))
    params: dict[str, Any] = {"ul_id": ul_id, "min_year": min_year}

    # --- Query 1: Financials ---
    fin_rows = db.execute(text(FINANCIALS_QUERY), params).mappings().all()
    financials = [
        FinancialYear(
            year=int(r["year"]),
            total_billets=float(r["total_billets"] or 0),
            total_pieces=float(r["total_pieces"] or 0),
            total_cb=float(r["total_cb"] or 0),
            total_cheques=float(r["total_cheques"] or 0),
        )
        for r in fin_rows
    ]

    # --- Query 2: Hours by sector ---
    hrs_rows = db.execute(text(HOURS_BY_SECTOR_QUERY), params).mappings().all()
    hours_by_sector = [
        HoursBySector(
            year=int(r["year"]),
            secteur=int(r["secteur"]),
            label=SECTEUR_LABELS.get(int(r["secteur"]), f"Secteur {r['secteur']}"),
            total_hours=float(r["total_hours"] or 0),
        )
        for r in hrs_rows
    ]

    # --- Query 3: Quêteurs by sector ---
    q_rows = db.execute(text(QUETEURS_BY_SECTOR_QUERY), params).mappings().all()
    queteurs_by_sector = [
        QueteursBySector(
            year=int(r["year"]),
            secteur=int(r["secteur"]),
            label=SECTEUR_LABELS.get(int(r["secteur"]), f"Secteur {r['secteur']}"),
            nb_queteurs=int(r["nb_queteurs"]),
        )
        for r in q_rows
    ]

    # --- Query 4: Activity metrics ---
    act_rows = db.execute(text(ACTIVITY_QUERY), params).mappings().all()
    activity_metrics = [
        ActivityYear(
            year=int(r["year"]),
            nb_tronc_queteur=int(r["nb_tronc_queteur"]),
            nb_points_quete=int(r["nb_points_quete"]),
            nb_troncs=int(r["nb_troncs"]),
        )
        for r in act_rows
    ]

    result = UlOverviewResponse(
        years=years,
        financials=financials,
        hours_by_sector=hours_by_sector,
        queteurs_by_sector=queteurs_by_sector,
        activity_metrics=activity_metrics,
    )

    # --- Store in cache ---
    cache_set(cache_key, result.model_dump(), ttl_seconds=UL_OVERVIEW_CACHE_TTL)

    return result


# ---------------------------------------------------------------------------
# UL Settings — thank-you messages
# ---------------------------------------------------------------------------

SETTINGS_QUERY = """
    SELECT u.name AS ul_name,
           us.thanks_mail_benevole,
           us.thanks_mail_benevole1j
      FROM ul_settings us
      JOIN ul u ON u.id = us.ul_id
     WHERE us.ul_id = :ul_id
"""


def _check_settings_role(user: dict) -> None:
    """Raise 403 if the user role is not allowed for settings."""
    if str(user.get("role")) not in SETTINGS_ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux rôles admin ou super admin",
        )


@router.get("/ul/settings", response_model=UlSettingsResponse)
async def get_ul_settings(
    request: Request,
    db: Session = Depends(get_rcq_db),
) -> UlSettingsResponse:
    """Return the UL's thank-you message settings."""
    user = get_authenticated_user(request, db)
    _check_settings_role(user)
    ul_id = user["ul_id"]

    row = db.execute(text(SETTINGS_QUERY), {"ul_id": ul_id}).mappings().first()

    if row is None:
        # Return defaults when no settings row exists yet
        return UlSettingsResponse(
            ul_id=ul_id,
            ul_name=user["ul_name"],
        )

    return UlSettingsResponse(
        ul_id=ul_id,
        ul_name=row["ul_name"],
        thanks_mail_benevole=row["thanks_mail_benevole"],
        thanks_mail_benevole1j=row["thanks_mail_benevole1j"],
    )


@router.put("/ul/settings", response_model=UlSettingsResponse)
async def update_ul_settings(
    body: UlSettingsUpdate,
    request: Request,
    db: Session = Depends(get_rcq_db),
) -> UlSettingsResponse:
    """Update the UL's thank-you message settings."""
    user = get_authenticated_user(request, db)
    _check_settings_role(user)
    ul_id = user["ul_id"]
    user_id = user["user_id"]

    # Build SET clause with only provided (non-None) fields
    updates: dict[str, Any] = {}
    if body.thanks_mail_benevole is not None:
        updates["thanks_mail_benevole"] = body.thanks_mail_benevole
    if body.thanks_mail_benevole1j is not None:
        updates["thanks_mail_benevole1j"] = body.thanks_mail_benevole1j

    if updates:
        set_parts = [f"{col} = :{col}" for col in updates]
        set_parts.append("updated = NOW()")
        set_parts.append("last_update_user_id = :user_id")
        sql = f"UPDATE ul_settings SET {', '.join(set_parts)} WHERE ul_id = :ul_id"
        params = {**updates, "user_id": user_id, "ul_id": ul_id}
        db.execute(text(sql), params)
        db.commit()

        # Invalidate the UL info cache so merci pages pick up the new message
        cache_delete(f"ul:{ul_id}:info")

    # Re-query to return updated state
    row = db.execute(text(SETTINGS_QUERY), {"ul_id": ul_id}).mappings().first()

    if row is None:
        return UlSettingsResponse(
            ul_id=ul_id,
            ul_name=user["ul_name"],
        )

    return UlSettingsResponse(
        ul_id=ul_id,
        ul_name=row["ul_name"],
        thanks_mail_benevole=row["thanks_mail_benevole"],
        thanks_mail_benevole1j=row["thanks_mail_benevole1j"],
    )

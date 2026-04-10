"""UL (Unité Locale) search and overview endpoints."""
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..cache import cache_get, cache_set
from ..database import get_rcq_db
from ..routers.auth import get_authenticated_user
from ..schemas.ul import SecteurStats, UlOverviewResponse, UlSearchResponse, UlSearchResult

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

# Cache TTL for UL overview (5 minutes)
UL_OVERVIEW_CACHE_TTL = 300


@router.get("/ul/search", response_model=UlSearchResponse)
async def search_ul(
    request: Request,
    q: str = Query(..., min_length=2, description="Search query (min 2 characters)"),
    db: Session = Depends(get_rcq_db),
) -> UlSearchResponse:
    """Search for ULs by name. Restricted to Super Admin (role=9)."""
    user_profile = get_authenticated_user(request, db)

    if str(user_profile.get("role")) != "9":
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
# Vue globale UL — overview endpoint
# ---------------------------------------------------------------------------

UL_NAME_QUERY = """
    SELECT name FROM ul WHERE id = :ul_id
"""

OVERVIEW_QUERY = """
    SELECT
        q.secteur,
        COUNT(DISTINCT q.id) AS nb_queteurs,
        ROUND(SUM(tqe.total_amount), 2) AS total_euro,
        ROUND(SUM(tqe.duration_minutes) / 60.0, 2) AS total_hours,
        COUNT(*) AS nb_sorties,
        ROUND(SUM(tqe.weight) / 1000, 2) AS total_weight_kg
    FROM v_tronc_queteur_enriched tqe
    JOIN queteur q ON tqe.queteur_id = q.id
    WHERE tqe.ul_id = :ul_id AND YEAR(tqe.depart) = :year
    GROUP BY q.secteur
    ORDER BY q.secteur
"""


@router.get("/ul/overview", response_model=UlOverviewResponse)
async def get_ul_overview(
    request: Request,
    year: int = Query(default=None, description="Année (défaut: année courante)"),
    db: Session = Depends(get_rcq_db),
) -> UlOverviewResponse:
    """Return a global overview of the UL's quête activity for a given year.

    Includes total KPIs and a breakdown by quêteur secteur (type).
    Results are cached in Valkey for 5 minutes.
    """
    user = get_authenticated_user(request, db)
    ul_id = user["ul_id"]

    if year is None:
        year = datetime.now().year

    # --- Check cache ---
    cache_key = f"ul_overview:{ul_id}:{year}"
    cached = cache_get(cache_key)
    if cached is not None:
        cached["from_cache"] = True
        return UlOverviewResponse(**cached)

    # --- UL name ---
    ul_row = db.execute(text(UL_NAME_QUERY), {"ul_id": ul_id}).mappings().first()
    ul_name = ul_row["name"] if ul_row else None

    # --- Secteur breakdown ---
    rows = db.execute(text(OVERVIEW_QUERY), {"ul_id": ul_id, "year": year}).mappings().all()

    secteurs: list[SecteurStats] = []
    total_euro = 0.0
    total_hours = 0.0
    total_queteurs = 0
    nb_sorties = 0
    total_weight_kg = 0.0

    for row in rows:
        secteur_id = int(row["secteur"])
        label = SECTEUR_LABELS.get(secteur_id, f"Secteur {secteur_id}")
        s = SecteurStats(
            secteur=secteur_id,
            label=label,
            nb_queteurs=int(row["nb_queteurs"]),
            total_euro=float(row["total_euro"] or 0),
            total_hours=float(row["total_hours"] or 0),
            nb_sorties=int(row["nb_sorties"]),
            total_weight_kg=float(row["total_weight_kg"] or 0),
        )
        secteurs.append(s)
        total_euro += s.total_euro
        total_hours += s.total_hours
        total_queteurs += s.nb_queteurs
        nb_sorties += s.nb_sorties
        total_weight_kg += s.total_weight_kg

    result = UlOverviewResponse(
        year=year,
        ul_id=ul_id,
        ul_name=ul_name,
        total_euro=round(total_euro, 2),
        total_hours=round(total_hours, 2),
        total_queteurs=total_queteurs,
        nb_sorties=nb_sorties,
        total_weight_kg=round(total_weight_kg, 2),
        secteurs=secteurs,
        from_cache=False,
    )

    # --- Store in cache ---
    cache_set(cache_key, result.model_dump(), ttl_seconds=UL_OVERVIEW_CACHE_TTL)

    return result

"""Comptage pièces, billets et CB endpoint with Valkey cache."""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..cache import cache_delete, cache_get, cache_set
from ..database import get_rcq_db
from ..routers.auth import get_authenticated_user
from ..roles import ROLES_COMPTEUR_AND_ABOVE, check_role
from ..schemas.comptage_pieces_billets import (
    CbTicket,
    ComptagePiecesBilletsResponse,
    DenominationCount,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["comptage-pieces-billets"])

# Cache TTLs
TTL_PAST_YEAR = 31_536_000  # 1 year in seconds
TTL_CURRENT_YEAR = 60  # 60 seconds

# ---------------------------------------------------------------------------
# SQL — Coins and bills totals (single row)
# ---------------------------------------------------------------------------
COINS_BILLS_QUERY = """
SELECT
  COALESCE(SUM(tqe.euro500), 0) AS euro500,
  COALESCE(SUM(tqe.euro200), 0) AS euro200,
  COALESCE(SUM(tqe.euro100), 0) AS euro100,
  COALESCE(SUM(tqe.euro50), 0) AS euro50,
  COALESCE(SUM(tqe.euro20), 0) AS euro20,
  COALESCE(SUM(tqe.euro10), 0) AS euro10,
  COALESCE(SUM(tqe.euro5), 0) AS euro5,
  COALESCE(SUM(tqe.euro2), 0) AS euro2,
  COALESCE(SUM(tqe.euro1), 0) AS euro1,
  COALESCE(SUM(tqe.cents50), 0) AS cents50,
  COALESCE(SUM(tqe.cents20), 0) AS cents20,
  COALESCE(SUM(tqe.cents10), 0) AS cents10,
  COALESCE(SUM(tqe.cents5), 0) AS cents5,
  COALESCE(SUM(tqe.cents2), 0) AS cents2,
  COALESCE(SUM(tqe.cent1), 0) AS cent1
FROM v_tronc_queteur_enriched tqe
WHERE tqe.ul_id = :ul_id
  AND YEAR(tqe.depart) = :year
  {days_filter}
"""

# ---------------------------------------------------------------------------
# SQL — CB tickets (grouped by amount)
# ---------------------------------------------------------------------------
# Note: v_tronc_queteur_enriched already filters out deleted=0 AND comptage IS NOT NULL,
# so the JOIN on the view replaces the previous JOIN on tronc_queteur.
CB_TICKETS_QUERY = """
SELECT
  cc.amount,
  SUM(cc.quantity) AS count
FROM credit_card cc
JOIN v_tronc_queteur_enriched tqe ON tqe.id = cc.tronc_queteur_id
WHERE cc.ul_id = :ul_id
  AND YEAR(tqe.depart) = :year
  {days_filter}
GROUP BY cc.amount
ORDER BY cc.amount
"""

# ---------------------------------------------------------------------------
# SQL — Available years
# ---------------------------------------------------------------------------
AVAILABLE_YEARS_QUERY = """
SELECT DISTINCT YEAR(depart) AS year
FROM v_tronc_queteur_enriched
WHERE ul_id = :ul_id
ORDER BY 1 DESC
"""

# Denomination mappings: (column_name, label, value_cents)
BILLETS = [
    ("euro500", "500 €", 50000),
    ("euro200", "200 €", 20000),
    ("euro100", "100 €", 10000),
    ("euro50", "50 €", 5000),
    ("euro20", "20 €", 2000),
    ("euro10", "10 €", 1000),
    ("euro5", "5 €", 500),
]

PIECES = [
    ("euro2", "2 €", 200),
    ("euro1", "1 €", 100),
    ("cents50", "50 c", 50),
    ("cents20", "20 c", 20),
    ("cents10", "10 c", 10),
    ("cents5", "5 c", 5),
    ("cents2", "2 c", 2),
    ("cent1", "1 c", 1),
]



def _build_denomination_list(
    row: dict, mapping: list[tuple[str, str, int]]
) -> list[DenominationCount]:
    """Build a list of DenominationCount from a DB row and a mapping."""
    return [
        DenominationCount(
            label=label,
            value_cents=value_cents,
            count=int(row[col]),
            total=round(int(row[col]) * value_cents / 100, 2),
        )
        for col, label, value_cents in mapping
    ]


# Duplicated locally from controle_donnees._build_days_filter — mutualisation
# vers utils.py est explicitement le sujet d'une PR ultérieure.
def _build_days_filter(days: Optional[str]) -> tuple[str, dict]:
    """Return (SQL clause, params dict) for quete_day_num filtering.

    *days* is a comma-separated list of day numbers (e.g. "1,2,3").
    Returns an empty clause when *days* is ``None`` or empty.
    """
    if not days or not days.strip():
        return "", {}
    day_list = [int(d.strip()) for d in days.split(",") if d.strip()]
    if not day_list:
        return "", {}
    placeholders = ", ".join(f":day_{i}" for i in range(len(day_list)))
    params = {f"day_{i}": d for i, d in enumerate(day_list)}
    return f"AND tqe.quete_day_num IN ({placeholders})", params


def _compute_days_signature(days: Optional[str]) -> str:
    """Compute a stable cache-key fragment from the *days* CSV param.

    - ``None`` (param not provided) or all 9 days selected → ``"all"``
    - empty string / no valid days → ``"none"`` (caches empty-result branch)
    - otherwise → sorted unique day numbers joined by ``-`` (e.g. ``"1-2-9"``)
    """
    if days is None:
        return "all"
    day_list = sorted({int(d.strip()) for d in days.split(",") if d.strip()})
    if not day_list:
        return "none"
    if day_list == list(range(1, 10)):
        return "all"
    return "-".join(str(d) for d in day_list)


@router.get(
    "/comptage-pieces-billets", response_model=ComptagePiecesBilletsResponse
)
async def get_comptage_pieces_billets(
    request: Request,
    year: int = Query(default=None, description="Year to query (defaults to current year)"),
    days: Optional[str] = Query(default=None, description="Jours de quête (ex: 1,2,3)"),
    refresh: bool = Query(default=False, description="Force cache refresh"),
    db: Session = Depends(get_rcq_db),
) -> ComptagePiecesBilletsResponse:
    """Return coins, bills and CB ticket counts for the requested year."""
    user = get_authenticated_user(request, db)
    check_role(user, ROLES_COMPTEUR_AND_ABOVE)
    ul_id = user["ul_id"]

    current_year = datetime.now().year
    if year is None:
        year = current_year

    is_current = year == current_year
    days_signature = _compute_days_signature(days)
    cache_key = f"comptage_pieces_billets:{ul_id}:{year}:{days_signature}"

    # --- Cache handling ---
    if refresh:
        cache_delete(cache_key)
        cached = None
    else:
        cached = cache_get(cache_key)

    if cached is not None:
        return ComptagePiecesBilletsResponse(**cached)

    # When *days* is provided but resolves to an empty list (e.g. days=""),
    # skip the totals queries entirely and return empty arrays — but still
    # compute available_years so the UI can populate its year selector.
    skip_totals = days is not None and days_signature == "none"

    pieces: list[DenominationCount] = []
    billets: list[DenominationCount] = []
    cb_tickets: list[CbTicket] = []

    if not skip_totals:
        days_clause, days_params = _build_days_filter(days)

        # --- Query coins & bills (single row) ---
        coins_query = COINS_BILLS_QUERY.format(days_filter=days_clause)
        row = (
            db.execute(
                text(coins_query),
                {"ul_id": ul_id, "year": year, **days_params},
            )
            .mappings()
            .first()
        )

        if row is not None:
            pieces = _build_denomination_list(dict(row), PIECES)
            billets = _build_denomination_list(dict(row), BILLETS)

        # --- Query CB tickets ---
        cb_query = CB_TICKETS_QUERY.format(days_filter=days_clause)
        cb_rows = (
            db.execute(
                text(cb_query),
                {"ul_id": ul_id, "year": year, **days_params},
            )
            .mappings()
            .all()
        )
        cb_tickets = [
            CbTicket(
                amount=float(r["amount"]),
                count=int(r["count"]),
                total=round(float(r["amount"]) * int(r["count"]), 2),
            )
            for r in cb_rows
        ]

    # --- Query available years ---
    year_rows = (
        db.execute(text(AVAILABLE_YEARS_QUERY), {"ul_id": ul_id})
        .mappings()
        .all()
    )
    available_years = [int(r["year"]) for r in year_rows]
    if current_year not in available_years:
        available_years.insert(0, current_year)

    result = ComptagePiecesBilletsResponse(
        pieces=pieces,
        billets=billets,
        cb_tickets=cb_tickets,
        year=year,
        available_years=available_years,
    )

    # --- Store in cache ---
    ttl = TTL_CURRENT_YEAR if is_current else TTL_PAST_YEAR
    cache_set(cache_key, result.model_dump(), ttl_seconds=ttl)

    return result

"""Contrôle admin — règles d'anomalie sur les troncs et ULs (Super Admin uniquement)."""
from datetime import datetime
from io import StringIO
from math import ceil
from typing import Any, Optional

import csv as _csv
from fastapi import APIRouter, Depends, HTTPException, Query, Request as FastAPIRequest, status
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..cache import cache_get, cache_set
from ..database import get_rcq_db
from ..roles import ROLES_SUPER_ADMIN_ONLY, check_role_real
from ..schemas.controle_admin import (
    AnomalieTroncCbMismatch,
    AnomalieTroncDatesFutures,
    AnomalieTroncDepartApresRetour,
    AnomalieTroncMontantEleve,
    AnomalieTroncSaisieSuspecte,
    AnomalieTroncSansRetour,
    AnomalieTroncTempsCourt,
    ControleAdminCounts,
    ControleAdminSettings,
    PaginatedResponse,
    UlDetailAdmin,
    UlDetailInfo,
    UlDetailRegistration,
    UlDetailResponse,
    UlDoublons,
    UlDormante,
    UlNonValidee,
    UlPeuPoints,
    UlPeuQueteurs,
    UlPeuTroncs,
    UlPeuUsers,
    UlSansObjectif,
)
from .auth import get_authenticated_user

router = APIRouter(prefix="/api/controle-admin", tags=["controle-admin"])

# ---------------------------------------------------------------------------
# Settings (Valkey-backed seuils)
# ---------------------------------------------------------------------------

SETTINGS_KEY = "controle_admin:settings"


def _get_settings() -> ControleAdminSettings:
    """Return the stored seuils or defaults when Valkey is unavailable."""
    raw = cache_get(SETTINGS_KEY)
    if not isinstance(raw, dict):
        return ControleAdminSettings()
    try:
        return ControleAdminSettings(**raw)
    except Exception:
        return ControleAdminSettings()


# ---------------------------------------------------------------------------
# Filter helpers — all queries use `tronc_queteur tq` directly (not the view)
# ---------------------------------------------------------------------------

def _build_year_filter_tq(year: Optional[int]) -> tuple[str, dict]:
    """Year filter on tq.depart (None → current year, 0 → no filter)."""
    if year is None:
        year = datetime.now().year
    if year == 0:
        return "", {}
    return "AND YEAR(tq.depart) = :year", {"year": year}


def _build_days_filter_tq(days: Optional[str]) -> tuple[str, str, dict]:
    """Return (join_clause, where_clause, params) for days filter on tq.depart."""
    if not days or not days.strip():
        return "", "", {}
    day_list = [int(d.strip()) for d in days.split(",") if d.strip()]
    if not day_list or len(day_list) >= 9:
        return "", "", {}
    placeholders = ", ".join(f":day_{i}" for i in range(len(day_list)))
    params = {f"day_{i}": d for i, d in enumerate(day_list)}
    join = "JOIN quete_dates qd ON qd.year = YEAR(tq.depart)"
    where = f"AND DATEDIFF(DATE(tq.depart), qd.start_date) + 1 IN ({placeholders})"
    return join, where, params


def _build_ul_filter_tq(ul_id: Optional[int]) -> tuple[str, dict]:
    """UL filter on tq.ul_id (None → all ULs)."""
    if ul_id is None:
        return "", {}
    return "AND tq.ul_id = :filter_ul_id", {"filter_ul_id": ul_id}


def _common_filters(year, days, ul_id) -> tuple[str, str, dict]:
    """Return (extra_join, extra_where, params) for year/days/ul."""
    year_clause, year_params = _build_year_filter_tq(year)
    days_join, days_clause, days_params = _build_days_filter_tq(days)
    ul_clause, ul_params = _build_ul_filter_tq(ul_id)
    extra_where = " ".join(c for c in (year_clause, days_clause, ul_clause) if c)
    return days_join, extra_where, {**year_params, **days_params, **ul_params}


# ---------------------------------------------------------------------------
# Pagination & sort helpers
# ---------------------------------------------------------------------------

def _clamp_page(page: int, page_size: int) -> tuple[int, int]:
    page = max(1, page)
    page_size = max(1, min(200, page_size))
    return page, page_size


def _order_by(sort: Optional[str], sort_dir: Optional[str],
              sort_map: dict[str, str], default: str) -> str:
    """Build ORDER BY from a whitelist (defence against SQL injection)."""
    col_sql = sort_map.get(sort or "")
    if not col_sql:
        return default
    direction = "DESC" if (sort_dir or "").lower() == "desc" else "ASC"
    return f"ORDER BY {col_sql} {direction}"


def _csv_response(rows: list[dict], filename: str) -> StreamingResponse:
    """Serialise rows to UTF-8-BOM CSV (comma separator, Google Sheets friendly)."""
    buffer = StringIO()
    buffer.write("\ufeff")  # BOM
    if rows:
        writer = _csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    else:
        buffer.write("")
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _run_rule(
    *,
    db: Session,
    select_fields: str,
    from_join: str,
    where_base: str,
    sort_map: dict[str, str],
    default_order: str,
    year: Optional[int],
    days: Optional[str],
    ul_id: Optional[int],
    page: int,
    page_size: int,
    sort: Optional[str],
    sort_dir: Optional[str],
    format_csv: bool,
    csv_filename: str,
    extra_params: Optional[dict] = None,
) -> Any:
    """Shared executor for all 7 rule endpoints (pagination + CSV export)."""
    extra_join, extra_where, flt_params = _common_filters(year, days, ul_id)
    params: dict[str, Any] = {**(extra_params or {}), **flt_params}

    base_from = f"{from_join} {extra_join}".strip()
    where_sql = f"{where_base} {extra_where}".strip()
    order_by_sql = _order_by(sort, sort_dir, sort_map, default_order)

    if format_csv:
        query = (
            f"SELECT {select_fields} FROM {base_from} "
            f"WHERE {where_sql} {order_by_sql}"
        )
        rows = db.execute(text(query), params).mappings().all()
        return _csv_response([dict(r) for r in rows], csv_filename)

    page, page_size = _clamp_page(page, page_size)
    count_sql = f"SELECT COUNT(*) FROM {base_from} WHERE {where_sql}"
    total = int(db.execute(text(count_sql), params).scalar() or 0)
    offset = (page - 1) * page_size
    query = (
        f"SELECT {select_fields} FROM {base_from} "
        f"WHERE {where_sql} {order_by_sql} LIMIT :_lim OFFSET :_off"
    )
    rows = db.execute(
        text(query), {**params, "_lim": page_size, "_off": offset}
    ).mappings().all()
    return {
        "items": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": ceil(total / page_size) if total else 0,
    }


def _count_rule(
    db: Session,
    *,
    from_join: str,
    where_base: str,
    year: Optional[int],
    days: Optional[str],
    ul_id: Optional[int],
    extra_params: Optional[dict] = None,
) -> int:
    """Return the COUNT(*) for a rule (used by /counts)."""
    extra_join, extra_where, flt_params = _common_filters(year, days, ul_id)
    params: dict[str, Any] = {**(extra_params or {}), **flt_params}
    base_from = f"{from_join} {extra_join}".strip()
    where_sql = f"{where_base} {extra_where}".strip()
    sql = f"SELECT COUNT(*) FROM {base_from} WHERE {where_sql}"
    return int(db.execute(text(sql), params).scalar() or 0)


# ---------------------------------------------------------------------------
# Shared SQL fragments per rule
# ---------------------------------------------------------------------------

_FROM_BASE = (
    "tronc_queteur tq "
    "JOIN queteur q ON q.id = tq.queteur_id "
    "JOIN ul ON ul.id = tq.ul_id"
)

_NB_TYPES_EXPR = (
    "(CASE WHEN COALESCE(tq.euro500,0)>0 THEN 1 ELSE 0 END"
    " + CASE WHEN COALESCE(tq.euro200,0)>0 THEN 1 ELSE 0 END"
    " + CASE WHEN COALESCE(tq.euro100,0)>0 THEN 1 ELSE 0 END"
    " + CASE WHEN COALESCE(tq.euro50,0)>0 THEN 1 ELSE 0 END"
    " + CASE WHEN COALESCE(tq.euro20,0)>0 THEN 1 ELSE 0 END"
    " + CASE WHEN COALESCE(tq.euro10,0)>0 THEN 1 ELSE 0 END"
    " + CASE WHEN COALESCE(tq.euro5,0)>0 THEN 1 ELSE 0 END"
    " + CASE WHEN COALESCE(tq.euro2,0)>0 THEN 1 ELSE 0 END"
    " + CASE WHEN COALESCE(tq.euro1,0)>0 THEN 1 ELSE 0 END"
    " + CASE WHEN COALESCE(tq.cents50,0)>0 THEN 1 ELSE 0 END"
    " + CASE WHEN COALESCE(tq.cents20,0)>0 THEN 1 ELSE 0 END"
    " + CASE WHEN COALESCE(tq.cents10,0)>0 THEN 1 ELSE 0 END"
    " + CASE WHEN COALESCE(tq.cents5,0)>0 THEN 1 ELSE 0 END"
    " + CASE WHEN COALESCE(tq.cents2,0)>0 THEN 1 ELSE 0 END"
    " + CASE WHEN COALESCE(tq.cent1,0)>0 THEN 1 ELSE 0 END)"
)

_CB_DETAIL_SUBQ = (
    "COALESCE((SELECT SUM(cc.quantity * cc.amount) FROM credit_card cc "
    "WHERE cc.tronc_queteur_id = tq.id), 0)"
)

_NB_LIGNES_CB_SUBQ = (
    "(SELECT COUNT(*) FROM credit_card cc WHERE cc.tronc_queteur_id = tq.id)"
)

_WHERE_R1 = (
    "tq.deleted = 0 AND tq.comptage IS NOT NULL AND tq.total_amount > 0 "
    "AND tq.retour IS NOT NULL "
    "AND TIMESTAMPDIFF(MINUTE, tq.depart, tq.retour) < :seuil_temps "
    "AND TIMESTAMPDIFF(MINUTE, tq.depart, tq.retour) >= 0"
)

_WHERE_R2 = (
    "tq.deleted = 0 AND tq.depart IS NOT NULL "
    "AND DATE(tq.depart) < CURDATE() "
    "AND (tq.retour IS NULL OR tq.comptage IS NULL)"
)

_WHERE_R3 = (
    "tq.deleted = 0 AND tq.comptage IS NOT NULL "
    "AND tq.total_amount > :seuil_montant"
)

_WHERE_R4 = (
    "tq.deleted = 0 AND tq.comptage IS NOT NULL "
    f"AND ABS(COALESCE(tq.don_creditcard,0) - {_CB_DETAIL_SUBQ}) > 0.01"
)

_WHERE_R5 = (
    "tq.deleted = 0 AND tq.comptage IS NOT NULL "
    "AND tq.total_amount > :seuil_saisie "
    "AND ("
    f"({_NB_TYPES_EXPR} = 1 AND COALESCE(tq.don_creditcard,0) = 0 "
    "AND COALESCE(tq.don_cheque,0) = 0)"
    " OR "
    f"({_NB_LIGNES_CB_SUBQ} = 1 AND COALESCE(tq.don_creditcard,0) > :seuil_saisie "
    f"AND {_NB_TYPES_EXPR} = 0 AND COALESCE(tq.don_cheque,0) = 0)"
    ")"
)

_WHERE_R11 = "tq.deleted = 0 AND tq.retour IS NOT NULL AND tq.depart > tq.retour"

_WHERE_R12 = "tq.deleted = 0 AND tq.depart IS NOT NULL AND tq.depart > NOW()"


# ---------------------------------------------------------------------------
# Settings endpoints (Valkey)
# ---------------------------------------------------------------------------

def _require_super_admin(request: FastAPIRequest, db: Session) -> dict:
    user = get_authenticated_user(request, db)
    check_role_real(user, ROLES_SUPER_ADMIN_ONLY)
    return user


@router.get("/settings", response_model=ControleAdminSettings)
async def get_settings(
    request: FastAPIRequest, db: Session = Depends(get_rcq_db)
) -> ControleAdminSettings:
    """Return the stored seuils (defaults when not yet saved)."""
    _require_super_admin(request, db)
    return _get_settings()


@router.put("/settings", response_model=ControleAdminSettings)
async def put_settings(
    body: ControleAdminSettings,
    request: FastAPIRequest,
    db: Session = Depends(get_rcq_db),
) -> ControleAdminSettings:
    """Persist the seuils in Valkey."""
    _require_super_admin(request, db)
    cache_set(SETTINGS_KEY, body.model_dump())
    return body


# ---------------------------------------------------------------------------
# Counts endpoint
# ---------------------------------------------------------------------------

@router.get("/counts", response_model=ControleAdminCounts)
async def get_counts(
    request: FastAPIRequest,
    year: Optional[int] = Query(default=None),
    days: Optional[str] = Query(default=None),
    ul_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_rcq_db),
) -> ControleAdminCounts:
    """Return the number of anomalies per rule for the badges."""
    _require_super_admin(request, db)
    s = _get_settings()
    return ControleAdminCounts(
        R1_temps_court=_count_rule(
            db, from_join=_FROM_BASE, where_base=_WHERE_R1,
            year=year, days=days, ul_id=ul_id,
            extra_params={"seuil_temps": s.seuil_temps_minutes},
        ),
        R2_sans_retour=_count_rule(
            db, from_join=_FROM_BASE, where_base=_WHERE_R2,
            year=year, days=days, ul_id=ul_id,
        ),
        R3_montant_eleve=_count_rule(
            db, from_join=_FROM_BASE, where_base=_WHERE_R3,
            year=year, days=days, ul_id=ul_id,
            extra_params={"seuil_montant": s.seuil_montant_max},
        ),
        R4_cb_mismatch=_count_rule(
            db, from_join=_FROM_BASE, where_base=_WHERE_R4,
            year=year, days=days, ul_id=ul_id,
        ),
        R5_saisie_suspecte=_count_rule(
            db, from_join=_FROM_BASE, where_base=_WHERE_R5,
            year=year, days=days, ul_id=ul_id,
            extra_params={"seuil_saisie": s.seuil_saisie_suspecte},
        ),
        R11_depart_apres_retour=_count_rule(
            db, from_join=_FROM_BASE, where_base=_WHERE_R11,
            year=year, days=days, ul_id=ul_id,
        ),
        R12_dates_futures=_count_rule(
            db, from_join=_FROM_BASE, where_base=_WHERE_R12,
            year=year, days=days, ul_id=ul_id,
        ),
        R6_sans_objectif=_count_ul_rule(db, _UL_R6_SQL, ul_id),
        R7_peu_queteurs=_count_ul_rule(db, _UL_R7_SQL, ul_id),
        R8_peu_users=_count_ul_rule(db, _UL_R8_SQL, ul_id),
        R9_peu_points=_count_ul_rule(db, _UL_R9_SQL, ul_id),
        R10_peu_troncs=_count_ul_rule(db, _UL_R10_SQL, ul_id),
        R10b_non_validee=_count_ul_rule(db, _UL_R10B_SQL, ul_id),
        R13_doublons=_count_ul_rule(
            db, _UL_R13_SQL, ul_id, filter_key="ul_filter_queteur"
        ),
        R14_dormante=_count_ul_rule(db, _UL_R14_SQL, ul_id),
    )


# ---------------------------------------------------------------------------
# Rule endpoints — common query params
# ---------------------------------------------------------------------------

_COMMON_PARAMS_DOC = "Filtres communs year/days/ul_id + pagination + tri + export CSV."


# --- R1 : temps court --------------------------------------------------------

_R1_SELECT = (
    "tq.id, tq.ul_id, ul.name AS ul_name, q.first_name, q.last_name, "
    "tq.depart, tq.retour, tq.total_amount AS montant, "
    "TIMESTAMPDIFF(MINUTE, tq.depart, tq.retour) AS duration_minutes, "
    "CASE WHEN TIMESTAMPDIFF(MINUTE, tq.depart, tq.retour) > 0 "
    "THEN ROUND(tq.total_amount / (TIMESTAMPDIFF(MINUTE, tq.depart, tq.retour) / 60.0), 2) "
    "ELSE 0 END AS taux_horaire"
)

_R1_SORT = {
    "ul_name": "ul.name",
    "last_name": "q.last_name",
    "montant": "tq.total_amount",
    "duration_minutes": "TIMESTAMPDIFF(MINUTE, tq.depart, tq.retour)",
    "taux_horaire": "(tq.total_amount / (TIMESTAMPDIFF(MINUTE, tq.depart, tq.retour) / 60.0))",
    "depart": "tq.depart",
}


@router.get("/troncs/temps-court", response_model=PaginatedResponse[AnomalieTroncTempsCourt])
async def troncs_temps_court(
    request: FastAPIRequest,
    year: Optional[int] = Query(default=None),
    days: Optional[str] = Query(default=None),
    ul_id: Optional[int] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    sort: Optional[str] = Query(default=None),
    sort_dir: Optional[str] = Query(default=None),
    format: Optional[str] = Query(default=None),
    db: Session = Depends(get_rcq_db),
):
    """R1 — Troncs avec durée < seuil ET montant > 0."""
    _require_super_admin(request, db)
    s = _get_settings()
    return _run_rule(
        db=db,
        select_fields=_R1_SELECT,
        from_join=_FROM_BASE,
        where_base=_WHERE_R1,
        sort_map=_R1_SORT,
        default_order=(
            "ORDER BY (tq.total_amount / "
            "(TIMESTAMPDIFF(MINUTE, tq.depart, tq.retour) / 60.0)) DESC"
        ),
        year=year, days=days, ul_id=ul_id,
        page=page, page_size=page_size,
        sort=sort, sort_dir=sort_dir,
        format_csv=(format == "csv"),
        csv_filename="controle_R1_temps_court.csv",
        extra_params={"seuil_temps": s.seuil_temps_minutes},
    )


# --- R2 : sans retour --------------------------------------------------------

_R2_SELECT = (
    "tq.id, tq.ul_id, ul.name AS ul_name, q.first_name, q.last_name, "
    "tq.depart, tq.retour, tq.comptage, tq.total_amount AS montant"
)

_R2_SORT = {
    "ul_name": "ul.name",
    "last_name": "q.last_name",
    "depart": "tq.depart",
    "montant": "tq.total_amount",
}


@router.get("/troncs/sans-retour", response_model=PaginatedResponse[AnomalieTroncSansRetour])
async def troncs_sans_retour(
    request: FastAPIRequest,
    year: Optional[int] = Query(default=None),
    days: Optional[str] = Query(default=None),
    ul_id: Optional[int] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    sort: Optional[str] = Query(default=None),
    sort_dir: Optional[str] = Query(default=None),
    format: Optional[str] = Query(default=None),
    db: Session = Depends(get_rcq_db),
):
    """R2 — Troncs des journées précédentes sans retour OU sans comptage."""
    _require_super_admin(request, db)
    return _run_rule(
        db=db,
        select_fields=_R2_SELECT,
        from_join=_FROM_BASE,
        where_base=_WHERE_R2,
        sort_map=_R2_SORT,
        default_order="ORDER BY tq.depart DESC",
        year=year, days=days, ul_id=ul_id,
        page=page, page_size=page_size,
        sort=sort, sort_dir=sort_dir,
        format_csv=(format == "csv"),
        csv_filename="controle_R2_sans_retour.csv",
    )


# --- R3 : montant elevé -----------------------------------------------------

_R3_SELECT = (
    "tq.id, tq.ul_id, ul.name AS ul_name, q.first_name, q.last_name, "
    "tq.depart, tq.total_amount AS montant, "
    "TIMESTAMPDIFF(MINUTE, tq.depart, tq.retour) AS duration_minutes"
)

_R3_SORT = {
    "ul_name": "ul.name",
    "last_name": "q.last_name",
    "depart": "tq.depart",
    "montant": "tq.total_amount",
    "duration_minutes": "TIMESTAMPDIFF(MINUTE, tq.depart, tq.retour)",
}


@router.get("/troncs/montant-eleve", response_model=PaginatedResponse[AnomalieTroncMontantEleve])
async def troncs_montant_eleve(
    request: FastAPIRequest,
    year: Optional[int] = Query(default=None),
    days: Optional[str] = Query(default=None),
    ul_id: Optional[int] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    sort: Optional[str] = Query(default=None),
    sort_dir: Optional[str] = Query(default=None),
    format: Optional[str] = Query(default=None),
    db: Session = Depends(get_rcq_db),
):
    """R3 — Troncs avec montant > seuil."""
    _require_super_admin(request, db)
    s = _get_settings()
    return _run_rule(
        db=db,
        select_fields=_R3_SELECT,
        from_join=_FROM_BASE,
        where_base=_WHERE_R3,
        sort_map=_R3_SORT,
        default_order="ORDER BY tq.total_amount DESC",
        year=year, days=days, ul_id=ul_id,
        page=page, page_size=page_size,
        sort=sort, sort_dir=sort_dir,
        format_csv=(format == "csv"),
        csv_filename="controle_R3_montant_eleve.csv",
        extra_params={"seuil_montant": s.seuil_montant_max},
    )


# --- R4 : CB mismatch -------------------------------------------------------

_R4_SELECT = (
    "tq.id, tq.ul_id, ul.name AS ul_name, q.first_name, q.last_name, "
    "tq.depart, tq.don_creditcard, "
    f"{_CB_DETAIL_SUBQ} AS cb_detail, "
    f"ROUND(COALESCE(tq.don_creditcard,0) - {_CB_DETAIL_SUBQ}, 2) AS ecart"
)

_R4_SORT = {
    "ul_name": "ul.name",
    "last_name": "q.last_name",
    "depart": "tq.depart",
    "don_creditcard": "tq.don_creditcard",
    "cb_detail": _CB_DETAIL_SUBQ,
    "ecart": f"ABS(COALESCE(tq.don_creditcard,0) - {_CB_DETAIL_SUBQ})",
}


@router.get("/troncs/cb-mismatch", response_model=PaginatedResponse[AnomalieTroncCbMismatch])
async def troncs_cb_mismatch(
    request: FastAPIRequest,
    year: Optional[int] = Query(default=None),
    days: Optional[str] = Query(default=None),
    ul_id: Optional[int] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    sort: Optional[str] = Query(default=None),
    sort_dir: Optional[str] = Query(default=None),
    format: Optional[str] = Query(default=None),
    db: Session = Depends(get_rcq_db),
):
    """R4 — Troncs où don_creditcard ≠ somme des lignes credit_card."""
    _require_super_admin(request, db)
    return _run_rule(
        db=db,
        select_fields=_R4_SELECT,
        from_join=_FROM_BASE,
        where_base=_WHERE_R4,
        sort_map=_R4_SORT,
        default_order=(
            f"ORDER BY ABS(COALESCE(tq.don_creditcard,0) - {_CB_DETAIL_SUBQ}) DESC"
        ),
        year=year, days=days, ul_id=ul_id,
        page=page, page_size=page_size,
        sort=sort, sort_dir=sort_dir,
        format_csv=(format == "csv"),
        csv_filename="controle_R4_cb_mismatch.csv",
    )


# --- R5 : saisie suspecte ---------------------------------------------------

_R5_SELECT = (
    "tq.id, tq.ul_id, ul.name AS ul_name, q.first_name, q.last_name, "
    "tq.depart, tq.total_amount AS montant, "
    f"{_NB_TYPES_EXPR} AS nb_types_remplis, "
    f"{_NB_LIGNES_CB_SUBQ} AS nb_lignes_cb"
)

_R5_SORT = {
    "ul_name": "ul.name",
    "last_name": "q.last_name",
    "depart": "tq.depart",
    "montant": "tq.total_amount",
    "nb_types_remplis": _NB_TYPES_EXPR,
}


@router.get("/troncs/saisie-suspecte", response_model=PaginatedResponse[AnomalieTroncSaisieSuspecte])
async def troncs_saisie_suspecte(
    request: FastAPIRequest,
    year: Optional[int] = Query(default=None),
    days: Optional[str] = Query(default=None),
    ul_id: Optional[int] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    sort: Optional[str] = Query(default=None),
    sort_dir: Optional[str] = Query(default=None),
    format: Optional[str] = Query(default=None),
    db: Session = Depends(get_rcq_db),
):
    """R5 — Montant significatif mais un seul type de pièce/billet ou une seule ligne CB."""
    _require_super_admin(request, db)
    s = _get_settings()
    return _run_rule(
        db=db,
        select_fields=_R5_SELECT,
        from_join=_FROM_BASE,
        where_base=_WHERE_R5,
        sort_map=_R5_SORT,
        default_order="ORDER BY tq.total_amount DESC",
        year=year, days=days, ul_id=ul_id,
        page=page, page_size=page_size,
        sort=sort, sort_dir=sort_dir,
        format_csv=(format == "csv"),
        csv_filename="controle_R5_saisie_suspecte.csv",
        extra_params={"seuil_saisie": s.seuil_saisie_suspecte},
    )


# --- R11 : depart après retour ----------------------------------------------

_R11_SELECT = (
    "tq.id, tq.ul_id, ul.name AS ul_name, q.first_name, q.last_name, "
    "tq.depart, tq.retour, tq.total_amount AS montant"
)

_R11_SORT = {
    "ul_name": "ul.name",
    "last_name": "q.last_name",
    "depart": "tq.depart",
    "retour": "tq.retour",
    "montant": "tq.total_amount",
}


@router.get("/troncs/depart-apres-retour", response_model=PaginatedResponse[AnomalieTroncDepartApresRetour])
async def troncs_depart_apres_retour(
    request: FastAPIRequest,
    year: Optional[int] = Query(default=None),
    days: Optional[str] = Query(default=None),
    ul_id: Optional[int] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    sort: Optional[str] = Query(default=None),
    sort_dir: Optional[str] = Query(default=None),
    format: Optional[str] = Query(default=None),
    db: Session = Depends(get_rcq_db),
):
    """R11 — Troncs dont la date de départ est postérieure à la date de retour."""
    _require_super_admin(request, db)
    return _run_rule(
        db=db,
        select_fields=_R11_SELECT,
        from_join=_FROM_BASE,
        where_base=_WHERE_R11,
        sort_map=_R11_SORT,
        default_order="ORDER BY tq.depart DESC",
        year=year, days=days, ul_id=ul_id,
        page=page, page_size=page_size,
        sort=sort, sort_dir=sort_dir,
        format_csv=(format == "csv"),
        csv_filename="controle_R11_depart_apres_retour.csv",
    )


# --- R12 : dates futures ----------------------------------------------------

_R12_SELECT = (
    "tq.id, tq.ul_id, ul.name AS ul_name, q.first_name, q.last_name, "
    "tq.depart, tq.total_amount AS montant"
)

_R12_SORT = {
    "ul_name": "ul.name",
    "last_name": "q.last_name",
    "depart": "tq.depart",
    "montant": "tq.total_amount",
}


@router.get("/troncs/dates-futures", response_model=PaginatedResponse[AnomalieTroncDatesFutures])
async def troncs_dates_futures(
    request: FastAPIRequest,
    year: Optional[int] = Query(default=None),
    days: Optional[str] = Query(default=None),
    ul_id: Optional[int] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    sort: Optional[str] = Query(default=None),
    sort_dir: Optional[str] = Query(default=None),
    format: Optional[str] = Query(default=None),
    db: Session = Depends(get_rcq_db),
):
    """R12 — Troncs dont la date de départ est dans le futur."""
    _require_super_admin(request, db)
    return _run_rule(
        db=db,
        select_fields=_R12_SELECT,
        from_join=_FROM_BASE,
        where_base=_WHERE_R12,
        sort_map=_R12_SORT,
        default_order="ORDER BY tq.depart DESC",
        year=year, days=days, ul_id=ul_id,
        page=page, page_size=page_size,
        sort=sort, sort_dir=sort_dir,
        format_csv=(format == "csv"),
        csv_filename="controle_R12_dates_futures.csv",
    )



# ===========================================================================
# UL rules — 8 règles d'anomalie sur les ULs + endpoint détail UL
# ===========================================================================

# --- Filter helpers ---------------------------------------------------------

def _build_ul_filter_direct(ul_id: Optional[int]) -> tuple[str, dict]:
    """UL filter on ul.id (None → all ULs)."""
    if ul_id is None:
        return "", {}
    return "AND ul.id = :filter_ul_id", {"filter_ul_id": ul_id}


def _build_ul_filter_queteur(ul_id: Optional[int]) -> tuple[str, dict]:
    """UL filter on q.ul_id (None → all ULs). Used by R13."""
    if ul_id is None:
        return "", {}
    return "AND q.ul_id = :filter_ul_id", {"filter_ul_id": ul_id}


# --- SQL templates (use {ul_filter} placeholder) ----------------------------

_UL_R6_SQL = """
    SELECT ul.id, ul.name, ul.city, ul.postal_code
    FROM ul
    WHERE ul.date_demarrage_rcq IS NOT NULL
      AND ul.id NOT IN (
          SELECT yg.ul_id FROM yearly_goal yg WHERE yg.year = YEAR(CURDATE())
      )
      {ul_filter}
"""

_UL_R7_SQL = """
    SELECT ul.id, ul.name, ul.city, ul.postal_code,
           COUNT(DISTINCT tq.queteur_id) AS nb_queteurs
    FROM ul
    LEFT JOIN tronc_queteur tq
      ON tq.ul_id = ul.id
     AND tq.deleted = 0
     AND tq.comptage IS NOT NULL
     AND tq.total_amount > 0
     AND YEAR(tq.depart) = YEAR(CURDATE())
    WHERE ul.date_demarrage_rcq IS NOT NULL
      {ul_filter}
    GROUP BY ul.id, ul.name, ul.city, ul.postal_code
    HAVING nb_queteurs < 10
"""

_UL_R8_SQL = """
    SELECT ul.id, ul.name, ul.city, ul.postal_code,
           COUNT(u.id) AS nb_users
    FROM ul
    LEFT JOIN queteur q2 ON q2.ul_id = ul.id
    LEFT JOIN users u ON u.queteur_id = q2.id AND u.active = 1
    WHERE ul.date_demarrage_rcq IS NOT NULL
      {ul_filter}
    GROUP BY ul.id, ul.name, ul.city, ul.postal_code
    HAVING nb_users < 3
"""

_UL_R9_SQL = """
    SELECT ul.id, ul.name, ul.city, ul.postal_code,
           COUNT(pq.id) AS nb_points
    FROM ul
    LEFT JOIN point_quete pq ON pq.ul_id = ul.id AND pq.enabled = 1
    WHERE ul.date_demarrage_rcq IS NOT NULL
      {ul_filter}
    GROUP BY ul.id, ul.name, ul.city, ul.postal_code
    HAVING nb_points < 5
"""

_UL_R10_SQL = """
    SELECT ul.id, ul.name, ul.city, ul.postal_code,
           COUNT(t.id) AS nb_troncs
    FROM ul
    LEFT JOIN tronc t ON t.ul_id = ul.id AND t.enabled = 1
    WHERE ul.date_demarrage_rcq IS NOT NULL
      {ul_filter}
    GROUP BY ul.id, ul.name, ul.city, ul.postal_code
    HAVING nb_troncs < 20
"""

_UL_R10B_SQL = """
    SELECT ul.id, ul.name, ul.city, ul.postal_code,
           ur.id AS registration_id,
           ur.created AS registration_date,
           ur.registration_approved
    FROM ul
    JOIN ul_registration ur ON ur.ul_id = ul.id
    WHERE (ur.registration_approved IS NULL OR ur.registration_approved = 0)
      {ul_filter}
"""

_UL_R13_SQL = """
    SELECT q.ul_id, ul.name AS ul_name, q.first_name, q.last_name,
           COUNT(*) AS nb_doublons
    FROM queteur q
    JOIN ul ON ul.id = q.ul_id
    WHERE q.active = 1
      {ul_filter}
    GROUP BY q.ul_id, ul.name, q.first_name, q.last_name
    HAVING COUNT(*) > 1
"""

_UL_R14_SQL = """
    SELECT ul.id, ul.name, ul.city, ul.postal_code,
           MAX(tq.depart) AS derniere_activite,
           DATEDIFF(CURDATE(), MAX(tq.depart)) AS jours_inactivite
    FROM ul
    LEFT JOIN tronc_queteur tq ON tq.ul_id = ul.id AND tq.deleted = 0
    WHERE ul.date_demarrage_rcq IS NOT NULL
      {ul_filter}
    GROUP BY ul.id, ul.name, ul.city, ul.postal_code
    HAVING MAX(tq.depart) IS NULL
        OR MAX(tq.depart) < DATE_SUB(CURDATE(), INTERVAL 2 YEAR)
"""


# --- Generic UL rule runner -------------------------------------------------

def _run_ul_rule(
    *,
    db: Session,
    sql_template: str,
    ul_id: Optional[int],
    format_csv: bool,
    csv_filename: str,
    filter_key: str = "ul_filter_direct",
) -> Any:
    """Shared executor for the 8 UL rule endpoints (list + CSV export)."""
    if filter_key == "ul_filter_queteur":
        ul_clause, ul_params = _build_ul_filter_queteur(ul_id)
    else:
        ul_clause, ul_params = _build_ul_filter_direct(ul_id)
    query = sql_template.format(ul_filter=ul_clause)
    rows = db.execute(text(query), ul_params).mappings().all()
    items = [dict(r) for r in rows]
    if format_csv:
        return _csv_response(items, csv_filename)
    total = len(items)
    return {
        "items": items,
        "total": total,
        "page": 1,
        "page_size": total if total else 1,
        "total_pages": 1 if total else 0,
    }


def _count_ul_rule(
    db: Session,
    sql_template: str,
    ul_id: Optional[int],
    filter_key: str = "ul_filter_direct",
) -> int:
    """Return the COUNT(*) of a UL rule by wrapping the SELECT as a subquery."""
    if filter_key == "ul_filter_queteur":
        ul_clause, ul_params = _build_ul_filter_queteur(ul_id)
    else:
        ul_clause, ul_params = _build_ul_filter_direct(ul_id)
    inner = sql_template.format(ul_filter=ul_clause)
    sql = f"SELECT COUNT(*) FROM ({inner}) _x"
    return int(db.execute(text(sql), ul_params).scalar() or 0)


# --- Rule endpoints ---------------------------------------------------------

@router.get("/uls/sans-objectif", response_model=PaginatedResponse[UlSansObjectif])
async def uls_sans_objectif(
    request: FastAPIRequest,
    ul_id: Optional[int] = Query(default=None),
    format: Optional[str] = Query(default=None),
    db: Session = Depends(get_rcq_db),
):
    """R6 — UL sans yearly_goal pour l'année en cours."""
    _require_super_admin(request, db)
    return _run_ul_rule(
        db=db, sql_template=_UL_R6_SQL, ul_id=ul_id,
        format_csv=(format == "csv"),
        csv_filename="controle_R6_uls_sans_objectif.csv",
    )


@router.get("/uls/peu-queteurs", response_model=PaginatedResponse[UlPeuQueteurs])
async def uls_peu_queteurs(
    request: FastAPIRequest,
    ul_id: Optional[int] = Query(default=None),
    format: Optional[str] = Query(default=None),
    db: Session = Depends(get_rcq_db),
):
    """R7 — UL avec < 10 quêteurs actifs (année en cours)."""
    _require_super_admin(request, db)
    return _run_ul_rule(
        db=db, sql_template=_UL_R7_SQL, ul_id=ul_id,
        format_csv=(format == "csv"),
        csv_filename="controle_R7_uls_peu_queteurs.csv",
    )


@router.get("/uls/peu-users", response_model=PaginatedResponse[UlPeuUsers])
async def uls_peu_users(
    request: FastAPIRequest,
    ul_id: Optional[int] = Query(default=None),
    format: Optional[str] = Query(default=None),
    db: Session = Depends(get_rcq_db),
):
    """R8 — UL avec < 3 utilisateurs actifs."""
    _require_super_admin(request, db)
    return _run_ul_rule(
        db=db, sql_template=_UL_R8_SQL, ul_id=ul_id,
        format_csv=(format == "csv"),
        csv_filename="controle_R8_uls_peu_users.csv",
    )


@router.get("/uls/peu-points", response_model=PaginatedResponse[UlPeuPoints])
async def uls_peu_points(
    request: FastAPIRequest,
    ul_id: Optional[int] = Query(default=None),
    format: Optional[str] = Query(default=None),
    db: Session = Depends(get_rcq_db),
):
    """R9 — UL avec < 5 points de quête actifs."""
    _require_super_admin(request, db)
    return _run_ul_rule(
        db=db, sql_template=_UL_R9_SQL, ul_id=ul_id,
        format_csv=(format == "csv"),
        csv_filename="controle_R9_uls_peu_points.csv",
    )


@router.get("/uls/peu-troncs", response_model=PaginatedResponse[UlPeuTroncs])
async def uls_peu_troncs(
    request: FastAPIRequest,
    ul_id: Optional[int] = Query(default=None),
    format: Optional[str] = Query(default=None),
    db: Session = Depends(get_rcq_db),
):
    """R10 — UL avec < 20 troncs actifs."""
    _require_super_admin(request, db)
    return _run_ul_rule(
        db=db, sql_template=_UL_R10_SQL, ul_id=ul_id,
        format_csv=(format == "csv"),
        csv_filename="controle_R10_uls_peu_troncs.csv",
    )

@router.get("/uls/non-validee", response_model=PaginatedResponse[UlNonValidee])
async def uls_non_validee(
    request: FastAPIRequest,
    ul_id: Optional[int] = Query(default=None),
    format: Optional[str] = Query(default=None),
    db: Session = Depends(get_rcq_db),
):
    """R10b — UL dont l'inscription n'est pas approuvée."""
    _require_super_admin(request, db)
    return _run_ul_rule(
        db=db, sql_template=_UL_R10B_SQL, ul_id=ul_id,
        format_csv=(format == "csv"),
        csv_filename="controle_R10b_uls_non_validee.csv",
    )


@router.get("/uls/doublons", response_model=PaginatedResponse[UlDoublons])
async def uls_doublons(
    request: FastAPIRequest,
    ul_id: Optional[int] = Query(default=None),
    format: Optional[str] = Query(default=None),
    db: Session = Depends(get_rcq_db),
):
    """R13 — Quêteurs en doublon (même prénom+nom dans la même UL)."""
    _require_super_admin(request, db)
    return _run_ul_rule(
        db=db, sql_template=_UL_R13_SQL, ul_id=ul_id,
        format_csv=(format == "csv"),
        csv_filename="controle_R13_uls_doublons.csv",
        filter_key="ul_filter_queteur",
    )


@router.get("/uls/dormante", response_model=PaginatedResponse[UlDormante])
async def uls_dormante(
    request: FastAPIRequest,
    ul_id: Optional[int] = Query(default=None),
    format: Optional[str] = Query(default=None),
    db: Session = Depends(get_rcq_db),
):
    """R14 — UL sans tronc_queteur depuis > 2 ans."""
    _require_super_admin(request, db)
    return _run_ul_rule(
        db=db, sql_template=_UL_R14_SQL, ul_id=ul_id,
        format_csv=(format == "csv"),
        csv_filename="controle_R14_uls_dormante.csv",
    )


# --- UL detail endpoint -----------------------------------------------------

_UL_DETAIL_SQL = """
    SELECT ul.id, ul.name, ul.city, ul.postal_code,
           ur.id AS registration_id,
           ur.created AS registration_date,
           ur.registration_approved,
           ur.admin_man,
           ur.admin_first_name,
           ur.admin_last_name,
           ur.admin_email,
           ur.admin_mobile
    FROM ul
    LEFT JOIN ul_registration ur ON ur.ul_id = ul.id
    WHERE ul.id = :ul_id
"""


@router.get("/uls/{ul_id}/detail", response_model=UlDetailResponse)
async def ul_detail(
    ul_id: int,
    request: FastAPIRequest,
    db: Session = Depends(get_rcq_db),
) -> UlDetailResponse:
    """Return detail for a single UL: info, admin, registration."""
    _require_super_admin(request, db)
    row = db.execute(text(_UL_DETAIL_SQL), {"ul_id": ul_id}).mappings().first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"UL {ul_id} not found",
        )
    return UlDetailResponse(
        ul=UlDetailInfo(
            id=row["id"],
            name=row["name"],
            city=row["city"],
            postal_code=row["postal_code"],
        ),
        admin=UlDetailAdmin(
            man=bool(row["admin_man"]) if row["admin_man"] is not None else None,
            first_name=row["admin_first_name"],
            last_name=row["admin_last_name"],
            email=row["admin_email"],
            mobile=row["admin_mobile"],
        ),
        registration=UlDetailRegistration(
            id=row["registration_id"],
            created=row["registration_date"],
            registration_approved=(
                bool(row["registration_approved"])
                if row["registration_approved"] is not None else None
            ),
        ),
    )


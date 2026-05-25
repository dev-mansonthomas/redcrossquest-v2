"""Shared utilities for RCQ V2 backend."""
from datetime import datetime
from typing import Optional


SECTEUR_MAPPING: dict[str, list[int]] = {
    "benevole": [1, 2],
    "benevole_jour": [3],
    "ancien": [4],
    "commercant": [5],
    "special": [6],
}


def build_secteur_filter(secteur: Optional[str]) -> tuple[str, dict]:
    """Return (SQL clause, params dict) for the secteur filter.

    If *secteur* is ``None`` or empty, returns an empty clause so that all
    sectors are included.  Otherwise maps the human-readable key to the
    corresponding ``q.secteur`` value(s).
    """
    if not secteur:
        return "", {}

    values = SECTEUR_MAPPING.get(secteur)
    if values is None:
        return "", {}

    if len(values) == 1:
        return "AND q.secteur = :secteur_val", {"secteur_val": values[0]}

    placeholders = ", ".join(f":sv{i}" for i in range(len(values)))
    params = {f"sv{i}": v for i, v in enumerate(values)}
    return f"AND q.secteur IN ({placeholders})", params


def build_year_filter(year: Optional[int]) -> tuple[str, dict]:
    """Return (SQL clause, params dict) for year filtering.

    - ``None`` → current year (default behaviour).
    - ``0``    → no year filter (all years).
    - Any other int → filter on that specific year.
    """
    if year is None:
        year = datetime.now().year
    if year == 0:
        return "", {}
    return "AND YEAR(tqe.depart) = :year", {"year": year}


def build_days_filter(days: Optional[str]) -> tuple[str, dict]:
    """Return (SQL clause, params dict) for ``quete_day_num`` filtering.

    *days* is a comma-separated list of day numbers (e.g. ``"1,2,3"``).
    Returns an empty clause when *days* is ``None`` or empty.

    The clause is of the form ``AND tqe.quete_day_num IN (...)`` and is meant
    to be appended to queries that already alias the enriched view as ``tqe``.
    """
    if not days or not days.strip():
        return "", {}
    day_list = [int(d.strip()) for d in days.split(",") if d.strip()]
    if not day_list:
        return "", {}
    placeholders = ", ".join(f":day_{i}" for i in range(len(day_list)))
    params = {f"day_{i}": d for i, d in enumerate(day_list)}
    return f"AND tqe.quete_day_num IN ({placeholders})", params


def build_days_filter_with_tq_join(days: Optional[str]) -> tuple[str, str, dict]:
    """Return (join_clause, where_clause, params) for days filter on ``tq.depart``.

    Variant of :func:`build_days_filter` for queries that use ``tronc_queteur tq``
    directly (without the enriched view). It joins ``quete_dates qd`` on the
    year of ``tq.depart`` and filters on the day number derived from
    ``DATEDIFF(DATE(tq.depart), qd.start_date) + 1``.

    Returns empty clauses when *days* is ``None``, empty, or selects all 9 days.
    """
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

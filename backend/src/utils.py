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

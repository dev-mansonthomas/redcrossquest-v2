"""Centralised role definitions for the RCQ backend.

Every router imports its role requirements from here instead of
maintaining its own ``ALLOWED_ROLES`` / ``_check_role`` helpers.
"""

from enum import IntEnum

from fastapi import HTTPException, status


# ---------------------------------------------------------------------------
# Role IntEnum
# ---------------------------------------------------------------------------

class Role(IntEnum):
    """Application roles — mirrors the ``users.role`` column."""

    LECTURE_SEUL = 1
    OPERATEUR = 2
    COMPTEUR = 3
    ADMIN = 4
    SUPER_ADMIN = 9


# ---------------------------------------------------------------------------
# Human-readable labels  (keyed by int so callers don't need str casts)
# ---------------------------------------------------------------------------

ROLE_NAMES: dict[int, str] = {
    Role.LECTURE_SEUL: "Lecture seul",
    Role.OPERATEUR: "Opérateur",
    Role.COMPTEUR: "Compteur",
    Role.ADMIN: "Admin",
    Role.SUPER_ADMIN: "Super Admin",
}


# ---------------------------------------------------------------------------
# Pre-built frozensets — one per access tier
# ---------------------------------------------------------------------------

ROLES_SUPER_ADMIN_ONLY: frozenset[int] = frozenset({Role.SUPER_ADMIN})

ROLES_ADMIN_AND_ABOVE: frozenset[int] = frozenset({Role.ADMIN, Role.SUPER_ADMIN})

ROLES_COMPTEUR_AND_ABOVE: frozenset[int] = frozenset({
    Role.COMPTEUR,
    Role.ADMIN,
    Role.SUPER_ADMIN,
})

ROLES_OPERATEUR_AND_ABOVE: frozenset[int] = frozenset({
    Role.OPERATEUR,
    Role.COMPTEUR,
    Role.ADMIN,
    Role.SUPER_ADMIN,
})

ROLES_ALL: frozenset[int] = frozenset({
    Role.LECTURE_SEUL,
    Role.OPERATEUR,
    Role.COMPTEUR,
    Role.ADMIN,
    Role.SUPER_ADMIN,
})


# ---------------------------------------------------------------------------
# Shared check helpers
# ---------------------------------------------------------------------------

def check_role(user: dict, allowed: frozenset[int]) -> None:
    """Raise 403 if the user's effective role is not in *allowed*.

    Uses ``user["role"]`` (which may already be overridden by the
    Super-Admin role-override mechanism in ``auth.py``).
    """
    role = user.get("role")
    try:
        role = int(role)
    except (TypeError, ValueError):
        role = None
    if role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès interdit pour ce rôle",
        )


def check_role_real(user: dict, allowed: frozenset[int]) -> None:
    """Like :func:`check_role` but uses the *real* role.

    When a Super-Admin activates a role override, ``user["role"]``
    contains the overridden value while ``user["real_role"]`` keeps the
    original.  This helper checks against ``real_role`` (falling back to
    ``role``), so the endpoint is protected even under an override.
    """
    role = user.get("real_role") or user.get("role")
    try:
        role = int(role)
    except (TypeError, ValueError):
        role = None
    if role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès interdit pour ce rôle",
        )

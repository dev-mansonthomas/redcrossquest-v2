"""UL (Unité Locale) search endpoints."""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_rcq_db
from ..routers.auth import get_authenticated_user
from ..schemas.ul import UlSearchResponse, UlSearchResult

router = APIRouter(prefix="/api", tags=["ul"])


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

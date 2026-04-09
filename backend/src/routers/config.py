"""Configuration endpoints for the frontend."""
from fastapi import APIRouter, Depends, Request as FastAPIRequest
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_rcq_db
from ..schemas.money_bags import RcqUrlsResponse
from .auth import get_authenticated_user

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/rcq-urls", response_model=RcqUrlsResponse)
async def get_rcq_urls(
    request: FastAPIRequest,
    db: Session = Depends(get_rcq_db),
) -> RcqUrlsResponse:
    """Return RCQ URLs for the frontend. Accessible to all authenticated users."""
    get_authenticated_user(request, db)
    return RcqUrlsResponse(
        base_url=settings.rcq_base_url,
        tronc_queteur_uri=settings.rcq_tronc_queteur_uri,
    )

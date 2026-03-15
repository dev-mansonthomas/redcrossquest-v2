"""Health check endpoint."""
from fastapi import APIRouter
from ..schemas.user import HealthResponse
from ..config import settings

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check():
    """
    Health check endpoint for Cloud Run.
    
    Returns application status and environment information.
    """
    return HealthResponse(
        status="healthy",
        environment=settings.environment
    )


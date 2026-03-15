"""Authentication endpoints (placeholder for Wave 2)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..schemas.user import UserResponse
from ..database import get_rcq_db

router = APIRouter(prefix="/api", tags=["auth"])


@router.get("/me", response_model=UserResponse)
async def get_current_user(db: Session = Depends(get_rcq_db)):
    """
    Get current authenticated user information.
    
    Wave 1: Returns mock data
    Wave 2: Will validate Google OAuth token and return real user data
    """
    # TODO Wave 2: Implement Google OAuth validation
    # For now, return mock data for testing
    return UserResponse(
        id=1,
        email="test@redcross.fr",
        role="admin",
        ul_id=75001
    )


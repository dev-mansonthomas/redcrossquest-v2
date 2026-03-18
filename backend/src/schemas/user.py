"""User schemas for API responses."""
from pydantic import BaseModel, EmailStr
from typing import Optional


class UserResponse(BaseModel):
    """User information returned by /api/me endpoint."""

    email: EmailStr
    role: str
    ul_id: Optional[int] = None
    ul_name: Optional[str] = None

    model_config = {"from_attributes": True}


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    environment: str
    version: str = "0.1.0"

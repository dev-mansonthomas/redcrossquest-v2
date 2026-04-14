"""Schemas for UL settings (thank-you messages)."""
from typing import Optional

from pydantic import BaseModel, Field


class UlSettingsResponse(BaseModel):
    """Response schema for UL settings."""

    ul_id: int
    ul_name: str
    thanks_mail_benevole: Optional[str] = None
    thanks_mail_benevole1j: Optional[str] = None


class UlSettingsUpdate(BaseModel):
    """Update schema for UL settings."""

    thanks_mail_benevole: Optional[str] = Field(None, max_length=8000)
    thanks_mail_benevole1j: Optional[str] = Field(None, max_length=8000)

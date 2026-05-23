"""Common schema primitives shared across API response models."""
from datetime import datetime, timezone
from typing import Annotated

from pydantic import PlainSerializer


def _serialize_utc_z(value: datetime) -> str:
    """Serialize a datetime as ISO 8601 UTC with a ``Z`` suffix.

    Naive datetimes coming from SQLAlchemy/MySQL are assumed to be UTC
    (the DB runs with ``@@time_zone = '+00:00'``).
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


UTCDateTime = Annotated[
    datetime,
    PlainSerializer(_serialize_utc_z, return_type=str, when_used="json"),
]
"""``datetime`` alias that serializes to ISO 8601 UTC with a ``Z`` suffix.

Use this in API response schemas instead of ``datetime`` so the frontend's
``new Date(iso)`` parses the value as UTC rather than local time.
"""

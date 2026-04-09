"""Money bags schemas for API responses."""
from pydantic import BaseModel


class MoneyBagSummary(BaseModel):
    """Summary of a single money bag (coins or bills)."""

    bag_id: str
    bag_type: str
    tronc_count: int
    weight_grams: float
    total_amount: float

    model_config = {"from_attributes": True}


class MoneyBagsResponse(BaseModel):
    """Response for the money bags list endpoint."""

    bags: list[MoneyBagSummary]


class MoneyBagItem(BaseModel):
    """A single denomination item within a bag detail."""

    type: str
    count: int
    amount: float


class MoneyBagDetail(BaseModel):
    """Detailed breakdown of a single money bag."""

    bag_id: str
    bag_type: str
    weight_grams: float
    total_amount: float
    tronc_count: int
    items: list[MoneyBagItem]

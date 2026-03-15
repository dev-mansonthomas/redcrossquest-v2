"""Metabase embed endpoints (placeholder for Wave 2)."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["embed"])


class EmbedResponse(BaseModel):
    """Metabase embed URL response."""
    
    embed_url: str
    dashboard_key: str


@router.get("/embed/{dashboard_key}", response_model=EmbedResponse)
async def get_embed_url(dashboard_key: str):
    """
    Generate signed Metabase embed URL for a dashboard.
    
    Wave 1: Returns placeholder
    Wave 2: Will generate JWT-signed embed URL with ul_id filtering
    
    Args:
        dashboard_key: Dashboard identifier (e.g., 'cumul-journalier', 'kpi-annuels')
    """
    # TODO Wave 2: Implement Metabase JWT signing
    # For now, return placeholder
    valid_dashboards = [
        "cumul-journalier",
        "kpi-annuels", 
        "comptage-tresorier",
        "leaderboard"
    ]
    
    if dashboard_key not in valid_dashboards:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    
    return EmbedResponse(
        embed_url=f"https://metabase.example.com/embed/{dashboard_key}",
        dashboard_key=dashboard_key
    )


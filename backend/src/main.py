"""FastAPI application entry point."""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from .config import settings
from .routers import health, auth, config, comptage_pieces_billets, controle_donnees, embed, classement, classement_tronc, etats_troncs, mailing_stats, map, merci, money_bags, repartition_jours, stats_journalieres, superset, ul, yearly_goals

# Rate limiter (keyed by remote IP)
limiter = Limiter(key_func=get_remote_address)

# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    description="Backend API for RedCrossQuest V2 Dashboards",
    version="0.1.0",
    docs_url="/docs" if settings.debug else None,  # Disable docs in production
    redoc_url="/redoc" if settings.debug else None,
)

# Attach limiter state to app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Override-UL-Id", "X-Override-Role"],
)

# Include routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(config.router)
app.include_router(controle_donnees.router)
app.include_router(etats_troncs.router)
app.include_router(embed.router)
app.include_router(comptage_pieces_billets.router)
app.include_router(classement.router)
app.include_router(classement_tronc.router)
app.include_router(mailing_stats.router)
app.include_router(map.router)
app.include_router(money_bags.router)
app.include_router(superset.router)
app.include_router(repartition_jours.router)
app.include_router(stats_journalieres.router)
app.include_router(ul.router)
app.include_router(yearly_goals.router)
app.include_router(merci.router)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "RedCrossQuest V2 API",
        "version": "0.1.0",
        "environment": settings.environment
    }


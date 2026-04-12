"""FastAPI application entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .routers import health, auth, config, embed, classement, classement_tronc, map, money_bags, superset, ul, yearly_goals

# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    description="Backend API for RedCrossQuest V2 Dashboards",
    version="0.1.0",
    docs_url="/docs" if settings.debug else None,  # Disable docs in production
    redoc_url="/redoc" if settings.debug else None,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(config.router)
app.include_router(embed.router)
app.include_router(classement.router)
app.include_router(classement_tronc.router)
app.include_router(map.router)
app.include_router(money_bags.router)
app.include_router(superset.router)
app.include_router(ul.router)
app.include_router(yearly_goals.router)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "RedCrossQuest V2 API",
        "version": "0.1.0",
        "environment": settings.environment
    }


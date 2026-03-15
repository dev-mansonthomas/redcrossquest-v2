"""Database configuration and session management."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings

# SQLAlchemy engine for RCQ database (read-only)
rcq_engine = create_engine(
    settings.rcq_database_url,
    pool_pre_ping=True,  # Verify connections before using
    pool_recycle=3600,   # Recycle connections after 1 hour
    echo=settings.debug,  # Log SQL queries in debug mode
)

# Session factory
RCQSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=rcq_engine)

# Base class for ORM models
Base = declarative_base()


def get_rcq_db():
    """Dependency to get database session."""
    db = RCQSessionLocal()
    try:
        yield db
    finally:
        db.close()


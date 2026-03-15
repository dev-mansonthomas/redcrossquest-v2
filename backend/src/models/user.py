"""User model for RCQ database."""
from sqlalchemy import Column, Integer, String, DateTime
from ..database import Base


class User(Base):
    """User model mapping to existing RCQ users table."""
    
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    role = Column(String(50), nullable=False)
    ul_id = Column(Integer, nullable=True)  # Unite Locale ID for filtering
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)


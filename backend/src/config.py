"""Configuration management for RCQ API."""
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )
    
    # Application
    app_name: str = "RedCrossQuest V2 API"
    environment: Literal["dev", "test", "prod"] = "dev"
    debug: bool = False
    
    # Database - MySQL RCQ (read-only)
    rcq_db_host: str = "localhost"
    rcq_db_port: int = 3306
    rcq_db_name: str = "rcq_fr_dev_db"
    rcq_db_user: str = "rcq_readonly"
    rcq_db_password: str = ""
    
    # CORS
    cors_origins: list[str] = ["http://localhost:4200"]
    
    # Google OAuth (Wave 2)
    google_client_id: str = ""
    google_client_secret: str = ""
    
    # Metabase (Wave 2)
    metabase_secret_key: str = ""
    metabase_site_url: str = ""
    
    @property
    def rcq_database_url(self) -> str:
        """Construct MySQL database URL for SQLAlchemy."""
        return (
            f"mysql+pymysql://{self.rcq_db_user}:{self.rcq_db_password}"
            f"@{self.rcq_db_host}:{self.rcq_db_port}/{self.rcq_db_name}"
        )


# Global settings instance
settings = Settings()


"""Configuration management for RCQ API."""
from typing import Literal
from pydantic import Field
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

    # CORS — stored as comma-separated string to avoid pydantic-settings JSON parsing
    cors_origins_str: str = Field(default="http://localhost:4200", validation_alias="cors_origins")

    @property
    def cors_origins(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        return [origin.strip() for origin in self.cors_origins_str.split(",") if origin.strip()]

    # Google OAuth (Wave 2)
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    google_redirect_uri: str = ""

    # Session/JWT (Wave 2)
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    # Frontend
    frontend_url: str = "http://localhost:4210"

    # Superset (Wave 2)
    superset_url: str = "http://localhost:8088"
    superset_admin_username: str = "admin"
    superset_admin_password: str = ""

    # Superset Dashboard UUIDs
    superset_dashboard_yearly_goal: str = ""
    superset_dashboard_comptage_tresorier: str = ""
    superset_dashboard_leaderboard: str = ""

    @property
    def rcq_database_url(self) -> str:
        """Construct MySQL database URL for SQLAlchemy."""
        if "/" in self.rcq_db_host:
            # Cloud SQL Unix socket path (e.g., /cloudsql/project:region:instance)
            return (
                f"mysql+pymysql://{self.rcq_db_user}:{self.rcq_db_password}"
                f"@/{self.rcq_db_name}?unix_socket={self.rcq_db_host}"
            )
        return (
            f"mysql+pymysql://{self.rcq_db_user}:{self.rcq_db_password}"
            f"@{self.rcq_db_host}:{self.rcq_db_port}/{self.rcq_db_name}"
        )


# Global settings instance
settings = Settings()

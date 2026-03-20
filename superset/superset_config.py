"""Apache Superset configuration for RCQ V2."""
import os

# ---------------------------------------------------------
# Superset general config
# ---------------------------------------------------------
ROW_LIMIT = 50000
SECRET_KEY = os.environ.get("SUPERSET_SECRET_KEY", "CHANGE_ME_IN_PRODUCTION")

# ---------------------------------------------------------
# Superset metadata database (SQLite for local dev)
# ---------------------------------------------------------
SQLALCHEMY_DATABASE_URI = os.environ.get(
    "SUPERSET_METADATA_DB_URI",
    "sqlite:////app/superset_home/superset.db",
)

# ---------------------------------------------------------
# Valkey / Redis — Base 1 (Base 0 reserved for FastAPI)
# ---------------------------------------------------------
VALKEY_HOST = os.environ.get("VALKEY_HOST", "valkey")
VALKEY_PORT = int(os.environ.get("VALKEY_PORT", "6379"))
VALKEY_DB = 1  # Base 1 for Superset

CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 300,
    "CACHE_KEY_PREFIX": "superset_",
    "CACHE_REDIS_HOST": VALKEY_HOST,
    "CACHE_REDIS_PORT": VALKEY_PORT,
    "CACHE_REDIS_DB": VALKEY_DB,
}

DATA_CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 600,
    "CACHE_KEY_PREFIX": "superset_data_",
    "CACHE_REDIS_HOST": VALKEY_HOST,
    "CACHE_REDIS_PORT": VALKEY_PORT,
    "CACHE_REDIS_DB": VALKEY_DB,
}

FILTER_STATE_CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 600,
    "CACHE_KEY_PREFIX": "superset_filter_",
    "CACHE_REDIS_HOST": VALKEY_HOST,
    "CACHE_REDIS_PORT": VALKEY_PORT,
    "CACHE_REDIS_DB": VALKEY_DB,
}

EXPLORE_FORM_DATA_CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 600,
    "CACHE_KEY_PREFIX": "superset_explore_",
    "CACHE_REDIS_HOST": VALKEY_HOST,
    "CACHE_REDIS_PORT": VALKEY_PORT,
    "CACHE_REDIS_DB": VALKEY_DB,
}

# ---------------------------------------------------------
# Celery — Valkey as broker and result backend (Base 1)
# ---------------------------------------------------------
class CeleryConfig:
    broker_url = f"redis://{VALKEY_HOST}:{VALKEY_PORT}/{VALKEY_DB}"
    result_backend = f"redis://{VALKEY_HOST}:{VALKEY_PORT}/{VALKEY_DB}"
    worker_prefetch_multiplier = 1
    task_acks_late = True
    task_annotations = {
        "sql_lab.get_sql_results": {
            "rate_limit": "100/s",
        },
    }

CELERY_CONFIG = CeleryConfig

# ---------------------------------------------------------
# Feature flags
# ---------------------------------------------------------
FEATURE_FLAGS = {
    "EMBEDDED_SUPERSET": True,
    "ENABLE_TEMPLATE_PROCESSING": True,
    "DASHBOARD_CROSS_FILTERS": True,
    "DASHBOARD_RBAC": True,
    "ALERT_REPORTS": True,
}

# ---------------------------------------------------------
# Embedding / CORS
# ---------------------------------------------------------
ENABLE_CORS = True
CORS_OPTIONS = {
    "supports_credentials": True,
    "allow_headers": ["*"],
    "resources": [r"/api/*"],
    "origins": os.environ.get("SUPERSET_CORS_ORIGINS", "http://localhost:4210").split(","),
}

# Allow embedding in iframes
HTTP_HEADERS = {
    "X-Frame-Options": "ALLOWALL",
}

# Guest token for embedded dashboards
GUEST_ROLE_NAME = "Public"
GUEST_TOKEN_JWT_SECRET = os.environ.get("SUPERSET_SECRET_KEY", SECRET_KEY)
GUEST_TOKEN_JWT_ALGO = "HS256"
GUEST_TOKEN_HEADER_NAME = "X-GuestToken"
GUEST_TOKEN_JWT_EXP_SECONDS = 3600

# ---------------------------------------------------------
# Misc
# ---------------------------------------------------------
PREVENT_UNSAFE_DB_CONNECTIONS = False
WTF_CSRF_ENABLED = False  # Disable CSRF for API usage in dev

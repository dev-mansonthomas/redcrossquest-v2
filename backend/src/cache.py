"""Valkey (Redis-compatible) cache service with graceful fallback."""
import json
import logging
from typing import Any

import valkey

from .config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Singleton Valkey client
# ---------------------------------------------------------------------------
_client: valkey.Valkey | None = None
_disabled: bool = False


def _get_client() -> valkey.Valkey | None:
    """Return the shared Valkey client, or *None* if unavailable."""
    global _client, _disabled

    if _disabled:
        return None

    if _client is not None:
        return _client

    try:
        _client = valkey.Valkey(
            host=settings.valkey_host,
            port=settings.valkey_port,
            db=settings.valkey_db,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        # Verify connectivity
        _client.ping()
        logger.info("Valkey connected at %s:%s/%s", settings.valkey_host, settings.valkey_port, settings.valkey_db)
        return _client
    except Exception:
        logger.warning("Valkey unavailable – cache disabled (host=%s:%s)", settings.valkey_host, settings.valkey_port)
        _disabled = True
        _client = None
        return None


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def cache_get(key: str) -> Any | None:
    """Return the cached JSON value for *key*, or ``None`` on miss / error."""
    client = _get_client()
    if client is None:
        return None
    try:
        raw = client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception:
        logger.debug("cache_get failed for key=%s", key, exc_info=True)
        return None


def cache_set(key: str, value: Any, ttl_seconds: int = 300) -> bool:
    """Store *value* (JSON-serialisable) under *key* with a TTL. Returns True on success."""
    client = _get_client()
    if client is None:
        return False
    try:
        client.setex(key, ttl_seconds, json.dumps(value, default=str))
        return True
    except Exception:
        logger.debug("cache_set failed for key=%s", key, exc_info=True)
        return False


def cache_delete(key: str) -> bool:
    """Delete *key* from cache. Returns True on success."""
    client = _get_client()
    if client is None:
        return False
    try:
        client.delete(key)
        return True
    except Exception:
        logger.debug("cache_delete failed for key=%s", key, exc_info=True)
        return False


def cache_delete_pattern(pattern: str) -> int:
    """Delete all keys matching *pattern* (e.g. ``ul_overview:*``). Returns count deleted."""
    client = _get_client()
    if client is None:
        return 0
    try:
        keys = client.keys(pattern)
        if keys:
            return client.delete(*keys)
        return 0
    except Exception:
        logger.debug("cache_delete_pattern failed for pattern=%s", pattern, exc_info=True)
        return 0

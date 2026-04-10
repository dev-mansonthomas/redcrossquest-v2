"""Valkey cache service using native JSON module (valkey-bundle).

Uses JSON.SET / JSON.GET instead of STRING + json.dumps/loads.
Falls back gracefully when Valkey is unavailable.
"""
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
    """Return the cached JSON value for *key*, or ``None`` on miss / error.

    Uses the native JSON module (JSON.GET).  If the key exists but is a
    legacy STRING type, it is deleted so the next cache_set recreates it
    as a proper JSON key.
    """
    client = _get_client()
    if client is None:
        return None
    try:
        data = client.json().get(key)
        return data
    except Exception:
        # Likely a legacy STRING key – delete it so it gets recreated as JSON
        try:
            client.delete(key)
        except Exception:
            pass
        logger.debug("cache_get failed for key=%s", key, exc_info=True)
        return None


def cache_set(key: str, value: Any, ttl_seconds: int | None = None) -> bool:
    """Store *value* under *key* using native JSON.SET.

    If *ttl_seconds* is provided, an EXPIRE is set on the key.
    Pass ``None`` for data that should never expire (e.g. frozen past years).
    """
    client = _get_client()
    if client is None:
        return False
    try:
        client.json().set(key, "$", value)
        if ttl_seconds:
            client.expire(key, ttl_seconds)
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

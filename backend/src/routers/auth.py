"""Authentication endpoints for Google OAuth 2.0 and JWT sessions."""
import json
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException, Request as FastAPIRequest, Response, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy import text
from sqlalchemy.orm import Session

from slowapi import Limiter
from slowapi.util import get_remote_address

from ..cache import _get_client as _get_cache_client
from ..config import settings
from ..database import get_rcq_db
from ..schemas.user import UserResponse

limiter = Limiter(key_func=get_remote_address)

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
SESSION_COOKIE_NAME = "rcq_session"
OAUTH_STATE_COOKIE_NAME = "rcq_oauth_state"

ROLE_NAMES: dict[str, str] = {
    "1": "Lecture seul",
    "2": "Opérateur",
    "3": "Compteur",
    "4": "Admin",
    "9": "Super Admin",
}

router = APIRouter(prefix="/api", tags=["auth"])


def _cookie_secure_flag() -> bool:
    """Return True when cookies should be marked Secure."""
    return settings.environment != "dev"


def _require_oauth_settings() -> None:
    """Ensure Google OAuth configuration is present."""
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret or not settings.google_redirect_uri:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth is not configured",
        )


def _require_jwt_settings() -> None:
    """Ensure JWT configuration is present."""
    if not settings.jwt_secret_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT session signing is not configured",
        )


_JTI_BLACKLIST_PREFIX = "jti_blacklist:"


def _blacklist_jti(jti: str, ttl_seconds: int) -> None:
    """Add a JTI to the blacklist in Valkey with a TTL matching token expiry."""
    client = _get_cache_client()
    if client is None:
        logger.warning("Cannot blacklist jti=%s – Valkey unavailable", jti)
        return
    try:
        client.set(f"{_JTI_BLACKLIST_PREFIX}{jti}", "1", ex=ttl_seconds)
    except Exception:
        logger.warning("Failed to blacklist jti=%s", jti, exc_info=True)


def _is_jti_blacklisted(jti: str) -> bool:
    """Check whether a JTI has been revoked."""
    client = _get_cache_client()
    if client is None:
        return False
    try:
        return client.exists(f"{_JTI_BLACKLIST_PREFIX}{jti}") > 0
    except Exception:
        logger.debug("Failed to check jti blacklist for jti=%s", jti, exc_info=True)
        return False


def _google_http_request(url: str, *, data: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> dict[str, Any]:
    """Execute an HTTP request against Google OAuth endpoints."""
    encoded_data = urlencode(data).encode("utf-8") if data is not None else None
    request = Request(url, data=encoded_data, headers=headers or {})

    try:
        with urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Google OAuth request failed: {detail or exc.reason}",
        ) from exc
    except URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to reach Google OAuth services",
        ) from exc


def exchange_code_for_tokens(code: str) -> dict[str, Any]:
    """Exchange an authorization code for Google OAuth tokens."""
    _require_oauth_settings()
    return _google_http_request(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": settings.google_oauth_client_id,
            "client_secret": settings.google_oauth_client_secret,
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


def fetch_google_userinfo(access_token: str) -> dict[str, Any]:
    """Fetch the authenticated Google user's profile."""
    return _google_http_request(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
    )


def get_user_profile_by_email(db: Session, email: str) -> dict[str, Any]:
    """Load an RCQ user profile from the existing MySQL schema.

    Filters on active users and active queteurs only.
    Raises an error if multiple active accounts match the same email.
    """
    query = """
        SELECT
            u.id AS user_id,
            u.role,
            q.id AS queteur_id,
            q.ul_id,
            q.first_name,
            q.last_name,
            q.email,
            ul.name AS ul_name
        FROM users u
        JOIN queteur q ON u.queteur_id = q.id
        JOIN ul ON q.ul_id = ul.id
        WHERE q.email = :email
        AND q.active = 1
        AND u.active = 1
    """

    results = db.execute(text(query), {"email": email}).mappings().all()

    if len(results) == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Aucun compte actif trouvé pour cet email",
        )

    if len(results) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Plusieurs comptes actifs trouvés pour cet email ({len(results)} comptes). Contactez votre administrateur.",
        )

    # Un seul compte trouvé
    user_data = results[0]
    role = str(user_data["role"]) if user_data["role"] is not None else ""
    return {
        "user_id": user_data["user_id"],
        "email": user_data["email"],
        "role": user_data["role"],
        "ul_id": user_data["ul_id"],
        "ul_name": user_data["ul_name"],
        "role_name": ROLE_NAMES.get(role, ""),
    }


def create_session_token(user_profile: dict[str, Any]) -> str:
    """Create a signed JWT session token for the authenticated RCQ user."""
    _require_jwt_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": user_profile["email"],
        "email": user_profile["email"],
        "role": user_profile["role"],
        "ul_id": user_profile.get("ul_id"),
        "exp": expires_at,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_session_token(token: str) -> dict[str, Any]:
    """Decode and validate a signed JWT session token.

    Checks the JTI blacklist so that revoked tokens are rejected.
    """
    _require_jwt_settings()

    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
        ) from exc

    # Check JTI blacklist (revoked tokens)
    jti = payload.get("jti")
    if jti and _is_jti_blacklisted(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked",
        )

    email = payload.get("email") or payload.get("sub")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token is missing the user identity",
        )

    return {
        "email": email,
        "role": payload.get("role"),
        "ul_id": payload.get("ul_id"),
    }


def extract_session_token(request: FastAPIRequest) -> str:
    """Extract a session token from Authorization header or cookie."""
    authorization = request.headers.get("Authorization")
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Authorization header",
            )
        return token

    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        return token

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
    )


def get_authenticated_user(request: FastAPIRequest, db: Session) -> dict[str, Any]:
    """Resolve the current authenticated user from the session token."""
    token = extract_session_token(request)
    session_payload = decode_session_token(token)
    user_profile = get_user_profile_by_email(db, session_payload["email"])

    # Super Admin UL override
    override_ul_id = request.headers.get("X-Override-UL-Id")
    if override_ul_id and str(user_profile.get("role")) == "9":
        try:
            override_id = int(override_ul_id)
            ul_row = db.execute(
                text("SELECT id, name FROM ul WHERE id = :id"),
                {"id": override_id},
            ).mappings().first()
            if ul_row:
                user_profile["ul_id"] = override_id
                user_profile["ul_name"] = ul_row["name"]
        except (ValueError, TypeError):
            pass

    # Super Admin Role override
    override_role = request.headers.get("X-Override-Role")
    if override_role and str(user_profile.get("role")) == "9":
        try:
            override_role_int = int(override_role)
            real_role = int(user_profile.get("role", 0))
            # Security: override role must be <= real role (hierarchy: 1 < 2 < 3 < 4 < 9)
            if override_role_int <= real_role and str(override_role_int) in ROLE_NAMES:
                user_profile["real_role"] = real_role
                user_profile["role"] = override_role_int
                user_profile["role_name"] = ROLE_NAMES[str(override_role_int)]
        except (ValueError, TypeError):
            pass

    return user_profile


@router.get("/auth/login/google")
@limiter.limit("10/minute")
async def login(request: FastAPIRequest) -> Response:
    """Redirect the browser to the Google OAuth consent screen."""
    _require_oauth_settings()

    state = secrets.token_urlsafe(32)
    query = urlencode(
        {
            "client_id": settings.google_oauth_client_id,
            "redirect_uri": settings.google_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "online",
            "prompt": "select_account",
            "hd": "croix-rouge.fr",
            "state": state,
        }
    )
    response = Response(
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        headers={"Location": f"{GOOGLE_AUTH_URL}?{query}"},
    )
    response.set_cookie(
        key=OAUTH_STATE_COOKIE_NAME,
        value=state,
        max_age=600,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure_flag(),
        path="/",
    )
    return response


@router.get("/auth/callback")
@limiter.limit("10/minute")
async def auth_callback(
    request: FastAPIRequest,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_rcq_db),
):
    """Handle the Google OAuth callback and redirect to the frontend."""
    if error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Google OAuth error: {error}")
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Google authorization code")

    expected_state = request.cookies.get(OAUTH_STATE_COOKIE_NAME)
    if not state or not expected_state or state != expected_state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state")

    token_payload = exchange_code_for_tokens(code)
    access_token = token_payload.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Google token response did not include an access token",
        )

    google_user = fetch_google_userinfo(access_token)
    email = google_user.get("email")
    if not email or not google_user.get("email_verified", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Google account email is missing or not verified",
        )

    try:
        user_profile = get_user_profile_by_email(db, email)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_400_BAD_REQUEST and "Plusieurs comptes" in str(exc.detail):
            # Redirect to the frontend multi-account error page (no PII in URL)
            return RedirectResponse(
                url=f"{settings.frontend_url}/auth/multi-account-error",
                status_code=302,
            )
        raise

    session_token = create_session_token(user_profile)

    # Pass user info as query params so the frontend CallbackComponent can store them
    role = str(user_profile.get("role", ""))
    role_name = ROLE_NAMES.get(role, "")
    callback_params = urlencode({
        "token": session_token,
        "email": user_profile["email"],
        "name": google_user.get("name", user_profile["email"]),
        "role": role,
        "ul_id": str(user_profile.get("ul_id", "")),
        "ul_name": user_profile.get("ul_name", ""),
        "role_name": role_name,
    })
    redirect_url = f"{settings.frontend_url}/auth/callback?{callback_params}"

    redirect_response = RedirectResponse(url=redirect_url, status_code=302)
    redirect_response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        max_age=settings.jwt_expire_minutes * 60,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure_flag(),
        path="/",
    )
    redirect_response.delete_cookie(
        key=OAUTH_STATE_COOKIE_NAME,
        path="/",
        samesite="lax",
        secure=_cookie_secure_flag(),
    )
    return redirect_response


@router.get("/auth/logout")
async def logout(request: FastAPIRequest, response: Response) -> dict[str, str]:
    """Invalidate the current authenticated session and blacklist the JWT."""
    # Attempt to blacklist the current token's jti
    try:
        token = extract_session_token(request)
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        jti = payload.get("jti")
        if jti:
            # Blacklist for the remaining token lifetime
            exp = payload.get("exp", 0)
            remaining = max(int(exp - datetime.now(timezone.utc).timestamp()), 0)
            if remaining > 0:
                _blacklist_jti(jti, remaining)
    except Exception:
        # Best-effort: if token is missing/invalid, just clear cookies
        pass

    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        samesite="lax",
        secure=_cookie_secure_flag(),
    )
    response.delete_cookie(
        key=OAUTH_STATE_COOKIE_NAME,
        path="/",
        samesite="lax",
        secure=_cookie_secure_flag(),
    )
    return {"message": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def get_current_user(request: FastAPIRequest, db: Session = Depends(get_rcq_db)) -> UserResponse:
    """Return the currently authenticated RCQ user profile."""
    user_profile = get_authenticated_user(request, db)
    return UserResponse(**user_profile)

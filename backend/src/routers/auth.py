"""Authentication endpoints for Google OAuth 2.0 and JWT sessions."""
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException, Request as FastAPIRequest, Response, status
from jose import JWTError, jwt
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_rcq_db
from ..schemas.user import UserResponse

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
SESSION_COOKIE_NAME = "rcq_session"
OAUTH_STATE_COOKIE_NAME = "rcq_oauth_state"

router = APIRouter(prefix="/api", tags=["auth"])


def _cookie_secure_flag() -> bool:
    """Return True when cookies should be marked Secure."""
    return settings.environment != "dev"


def _require_oauth_settings() -> None:
    """Ensure Google OAuth configuration is present."""
    if not settings.google_client_id or not settings.google_client_secret or not settings.google_redirect_uri:
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
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
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


def get_user_profile_by_email(db: Session, email: str) -> dict[str, Any] | None:
    """Load an RCQ user profile from the existing MySQL schema."""
    result = db.execute(
        text(
            """
            SELECT q.email AS email,
                   u.role AS role,
                   q.ul_id AS ul_id,
                   ul.name AS ul_name
            FROM users u, queteur q, ul
            WHERE u.queteur_id = q.id
            AND q.ul_id = ul.id
            AND LOWER(q.email) = LOWER(:email)
            LIMIT 1
            """
        ),
        {"email": email},
    ).mappings().first()

    if not result:
        return None

    return {
        "email": result["email"],
        "role": result["role"],
        "ul_id": result["ul_id"],
        "ul_name": result["ul_name"],
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
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_session_token(token: str) -> dict[str, Any]:
    """Decode and validate a signed JWT session token."""
    _require_jwt_settings()

    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
        ) from exc

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

    if not user_profile:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not authorized",
        )

    return user_profile


@router.get("/auth/login/google")
async def login() -> Response:
    """Redirect the browser to the Google OAuth consent screen."""
    _require_oauth_settings()

    state = secrets.token_urlsafe(32)
    query = urlencode(
        {
            "client_id": settings.google_client_id,
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


@router.get("/auth/callback", response_model=UserResponse)
async def auth_callback(
    request: FastAPIRequest,
    response: Response,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_rcq_db),
):
    """Handle the Google OAuth callback and create a signed session."""
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

    user_profile = get_user_profile_by_email(db, email)
    if not user_profile:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not authorized")

    session_token = create_session_token(user_profile)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        max_age=settings.jwt_expire_minutes * 60,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure_flag(),
        path="/",
    )
    response.delete_cookie(
        key=OAUTH_STATE_COOKIE_NAME,
        path="/",
        samesite="lax",
        secure=_cookie_secure_flag(),
    )
    return UserResponse(**user_profile)


@router.get("/auth/logout")
async def logout(response: Response) -> dict[str, str]:
    """Invalidate the current authenticated session."""
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

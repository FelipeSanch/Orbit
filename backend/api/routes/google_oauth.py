import logging
import secrets
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from api.deps import get_current_user
from config import settings
from services.database import get_pool
from services.google_token_manager import google_token_manager
from services.redis import (
    delete_oauth_pkce,
    delete_oauth_state,
    get_oauth_pkce,
    get_oauth_state,
    set_oauth_pkce,
    set_oauth_state,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth/google", tags=["oauth"])


@router.get("")
async def google_auth_start(authorization: str = Query(...)) -> RedirectResponse:
    """Start Google OAuth flow.

    Accepts token via query param since this is a browser redirect.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")

    token = authorization.removeprefix("Bearer ")

    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT u.id FROM sessions s
               JOIN users u ON u.id = s.user_id
               WHERE s.token = $1 AND s.expires_at > NOW()""",
            token,
        )
    if not row:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user_id = str(row["id"])
    state = secrets.token_urlsafe(32)
    set_oauth_state(state, user_id)

    auth_url, code_verifier = google_token_manager.get_auth_url(state)
    set_oauth_pkce(state, code_verifier)
    return RedirectResponse(url=auth_url)


@router.get("/callback")
async def google_auth_callback(request: Request) -> RedirectResponse:
    """Handle Google OAuth callback."""
    code = request.query_params.get("code", "")
    state = request.query_params.get("state", "")
    google_error = request.query_params.get("error", "")

    if google_error:
        logger.warning("Google returned error on callback: %s", google_error)
        return RedirectResponse(
            url=f"{settings.frontend_url}/settings?google=error&reason={quote(google_error)}"
        )

    if not code or not state:
        logger.warning(
            "Google callback missing code/state (code=%s state=%s)",
            bool(code),
            bool(state),
        )
        return RedirectResponse(
            url=f"{settings.frontend_url}/settings?google=error&reason=missing_code_or_state"
        )

    user_id = get_oauth_state(state)
    if not user_id:
        logger.warning("Google callback — invalid or expired OAuth state")
        return RedirectResponse(
            url=f"{settings.frontend_url}/settings?google=error&reason=state_expired"
        )

    code_verifier = get_oauth_pkce(state)
    delete_oauth_state(state)
    delete_oauth_pkce(state)

    try:
        await google_token_manager.exchange_code_and_store(
            str(user_id), code, code_verifier=code_verifier
        )
    except Exception as e:
        logger.exception("Google OAuth callback failed: %s", e)
        return RedirectResponse(
            url=f"{settings.frontend_url}/settings?google=error&reason={quote(str(e)[:160])}"
        )

    return RedirectResponse(url=f"{settings.frontend_url}/settings?google=connected")


@router.get("/status")
async def google_auth_status(user: dict = Depends(get_current_user)) -> dict:
    """Check if the current user has a connected Google account."""
    connected = await google_token_manager.is_connected(user["id"])
    return {"connected": connected}


@router.delete("")
async def google_auth_disconnect(user: dict = Depends(get_current_user)) -> dict:
    """Delete Google tokens."""
    await google_token_manager.revoke_tokens(user["id"])
    return {"status": "disconnected"}

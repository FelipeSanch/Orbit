import secrets

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

from api.deps import get_current_user
from config import settings
from services.redis import delete_oauth_state, get_oauth_state, set_oauth_state
from services.token_manager import token_manager

router = APIRouter(prefix="/api/auth/microsoft", tags=["oauth"])


@router.get("")
async def microsoft_auth_start(user: dict = Depends(get_current_user)) -> RedirectResponse:
    """Start Microsoft OAuth flow. Stores state in Redis keyed to user_id."""
    state = secrets.token_urlsafe(32)
    set_oauth_state(state, user["id"])

    auth_url = token_manager.get_auth_url(state)
    return RedirectResponse(url=auth_url)


@router.get("/callback")
async def microsoft_auth_callback(code: str, state: str) -> RedirectResponse:
    """Handle Microsoft OAuth callback. Exchanges code for tokens and stores them."""
    user_id = get_oauth_state(state)

    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")

    delete_oauth_state(state)

    await token_manager.exchange_code_and_store(str(user_id), code)

    return RedirectResponse(url=f"{settings.frontend_url}/settings?microsoft=connected")


@router.get("/status")
async def microsoft_auth_status(user: dict = Depends(get_current_user)) -> dict:
    """Check if the current user has a connected Microsoft account."""
    connected = await token_manager.is_connected(user["id"])
    return {"connected": connected}


@router.delete("")
async def microsoft_auth_disconnect(user: dict = Depends(get_current_user)) -> dict:
    """Delete Microsoft tokens."""
    await token_manager.revoke_tokens(user["id"])
    return {"status": "disconnected"}

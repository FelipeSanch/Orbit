import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from api.deps import get_current_user
from config import settings
from services.database import get_pool
from services.redis import delete_oauth_state, get_oauth_state, set_oauth_state
from services.token_manager import token_manager

router = APIRouter(prefix="/api/auth/microsoft", tags=["oauth"])


@router.get("")
async def microsoft_auth_start(authorization: str = Query(...)) -> RedirectResponse:
    """Start Microsoft OAuth flow.

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

    auth_url = token_manager.get_auth_url(state)
    return RedirectResponse(url=auth_url)


@router.api_route("/callback", methods=["GET", "POST"])
async def microsoft_auth_callback(request: Request) -> RedirectResponse:
    """Handle Microsoft OAuth callback (GET with query params or POST with form body)."""
    if request.method == "POST":
        form = await request.form()
        code = str(form.get("code", ""))
        state = str(form.get("state", ""))
    else:
        code = request.query_params.get("code", "")
        state = request.query_params.get("state", "")

    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

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

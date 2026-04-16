from fastapi import Header, HTTPException

from services.supabase import get_supabase_client


async def get_current_user(authorization: str = Header(...)) -> dict:
    """Extract and validate Supabase JWT. Returns user dict with id and email."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization.removeprefix("Bearer ")

    try:
        client = get_supabase_client()
        user_response = client.auth.get_user(token)
        user = user_response.user

        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")

        return {"id": user.id, "email": user.email}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication failed")

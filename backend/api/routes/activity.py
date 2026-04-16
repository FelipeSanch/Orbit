from fastapi import APIRouter, Depends, Query

from api.deps import get_current_user
from services.supabase import get_supabase_client

router = APIRouter(prefix="/api/activity", tags=["activity"])


@router.get("")
async def list_activity(
    user: dict = Depends(get_current_user),
    event_type: str | None = Query(default=None),
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
) -> list:
    """List activity log entries for the current user."""
    query = (
        get_supabase_client()
        .table("activity_log")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )

    if event_type:
        query = query.eq("event_type", event_type)

    result = query.execute()
    return result.data

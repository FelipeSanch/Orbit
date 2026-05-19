from fastapi import APIRouter, Depends, Query

from api.deps import get_current_user
from repositories import activity as activity_repo

router = APIRouter(prefix="/api/activity", tags=["activity"])


@router.get("")
async def list_activity(
    user: dict = Depends(get_current_user),
    event_type: str | None = Query(default=None),
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
) -> list:
    """List activity log entries for the current user."""
    return await activity_repo.list_for_user(user["id"], event_type, limit, offset)

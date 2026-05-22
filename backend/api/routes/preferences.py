"""User preference endpoints — currently scoped to timezone.

GET  /api/me/preferences        returns the row (or defaults if absent)
PATCH /api/me/preferences       updates supplied fields, upserts on first call
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.deps import get_current_user
from repositories import preferences as pref_repo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/me/preferences", tags=["preferences"])


class PreferencesPatch(BaseModel):
    timezone: str | None = Field(default=None, max_length=64)


@router.get("")
async def get_preferences(user: dict = Depends(get_current_user)) -> dict:
    row = await pref_repo.get(user["id"])
    return row or {"user_id": user["id"], "timezone": "UTC"}


@router.patch("")
async def update_preferences(
    patch: PreferencesPatch,
    user: dict = Depends(get_current_user),
) -> dict:
    if patch.timezone is not None and not patch.timezone.strip():
        raise HTTPException(status_code=400, detail="timezone cannot be empty")
    row = await pref_repo.upsert(user["id"], timezone=patch.timezone)
    return row

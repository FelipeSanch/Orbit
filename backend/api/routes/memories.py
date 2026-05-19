import logging

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_current_user
from services.agno_db import get_agno_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/memories", tags=["memories"])


@router.get("")
async def list_memories(user: dict = Depends(get_current_user)) -> list[dict]:
    """Return stored user memories from Agno's memory store."""
    db = get_agno_db()
    try:
        memories, _ = await db.get_user_memories(
            user_id=user["id"],
            deserialize=False,
            limit=100,
        )
    except Exception as e:
        logger.warning("Could not load memories for %s: %s", user["id"], e)
        return []

    out: list[dict] = []
    for m in memories or []:
        out.append(
            {
                "id": m.get("id") or m.get("memory_id"),
                "memory": m.get("memory"),
                "topics": m.get("topics") or [],
                "updated_at": m.get("updated_at"),
            }
        )
    return out


@router.delete("/{memory_id}")
async def delete_memory(
    memory_id: str, user: dict = Depends(get_current_user)
) -> dict:
    """Forget a specific memory."""
    db = get_agno_db()
    try:
        await db.delete_user_memory(memory_id=memory_id, user_id=user["id"])
    except Exception as e:
        logger.warning("Delete memory failed: %s", e)
        raise HTTPException(status_code=500, detail="Could not delete memory") from e
    return {"status": "deleted", "id": memory_id}

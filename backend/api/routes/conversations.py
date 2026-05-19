from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_current_user
from repositories import conversations as conv_repo
from repositories import messages as msg_repo

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class UpdateConversationRequest(BaseModel):
    title: str


@router.get("")
async def list_conversations(user: dict = Depends(get_current_user)) -> list:
    """List all conversations for the current user, newest first."""
    return await conv_repo.list_for_user(user["id"])


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str, user: dict = Depends(get_current_user)) -> dict:
    """Get a conversation with its messages."""
    conversation = await conv_repo.get(conversation_id, user["id"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = await msg_repo.list_by_conversation(conversation_id)
    return {**conversation, "messages": messages}


@router.patch("/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    request: UpdateConversationRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """Update a conversation title."""
    result = await conv_repo.update_title(conversation_id, request.title)
    if not result:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return result


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str, user: dict = Depends(get_current_user)) -> dict:
    """Delete a conversation and its messages."""
    await conv_repo.delete(conversation_id, user["id"])
    return {"status": "deleted"}

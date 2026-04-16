from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_current_user
from services.supabase import get_supabase_client

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class UpdateConversationRequest(BaseModel):
    title: str


@router.get("")
async def list_conversations(user: dict = Depends(get_current_user)) -> list:
    """List all conversations for the current user, newest first."""
    result = (
        get_supabase_client()
        .table("conversations")
        .select("*")
        .eq("user_id", user["id"])
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str, user: dict = Depends(get_current_user)) -> dict:
    """Get a conversation with its messages."""
    supabase = get_supabase_client()

    conversation = (
        supabase.table("conversations")
        .select("*")
        .eq("id", conversation_id)
        .eq("user_id", user["id"])
        .maybe_single()
        .execute()
    )

    if not conversation.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = (
        supabase.table("messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .execute()
    )

    return {**conversation.data, "messages": messages.data}


@router.patch("/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    request: UpdateConversationRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """Update a conversation title."""
    result = (
        get_supabase_client()
        .table("conversations")
        .update({"title": request.title})
        .eq("id", conversation_id)
        .eq("user_id", user["id"])
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return result.data[0]


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str, user: dict = Depends(get_current_user)) -> dict:
    """Delete a conversation and its messages."""
    get_supabase_client().table("conversations").delete().eq("id", conversation_id).eq(
        "user_id", user["id"]
    ).execute()

    return {"status": "deleted"}

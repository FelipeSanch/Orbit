from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_current_user
from services.supabase import get_supabase_client

router = APIRouter(prefix="/api/chat", tags=["approval"])


class ApprovalRequest(BaseModel):
    approval_id: str
    approved: bool


@router.post("/approve")
async def approve_action(request: ApprovalRequest, user: dict = Depends(get_current_user)) -> dict:
    """Approve or reject a pending write action."""
    supabase = get_supabase_client()

    # Load and validate the pending approval
    result = (
        supabase.table("pending_approvals")
        .select("*")
        .eq("id", request.approval_id)
        .eq("user_id", user["id"])
        .eq("status", "pending")
        .maybe_single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Approval not found or already resolved")

    new_status = "approved" if request.approved else "rejected"

    supabase.table("pending_approvals").update(
        {
            "status": new_status,
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", request.approval_id).execute()

    # Log the resolution
    supabase.table("activity_log").insert(
        {
            "user_id": user["id"],
            "conversation_id": result.data["conversation_id"],
            "event_type": f"approval_{new_status}",
            "event_data": {
                "approval_id": request.approval_id,
                "tool_name": result.data["tool_name"],
                "run_id": result.data["run_id"],
            },
        }
    ).execute()

    return {
        "status": new_status,
        "approval_id": request.approval_id,
        "tool_name": result.data["tool_name"],
    }

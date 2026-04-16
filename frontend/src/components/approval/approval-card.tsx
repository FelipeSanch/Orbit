"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Approval } from "@/types/events";

const TOOL_DESCRIPTIONS: Record<string, string> = {
  send_email: "Send an email",
  reply_to_email: "Reply to an email",
  trash_email: "Move email to trash",
  modify_labels: "Modify email labels",
  create_event: "Create a calendar event",
  update_event: "Update a calendar event",
  delete_event: "Delete a calendar event",
  create_task: "Create a task",
  update_task: "Update a task",
  complete_task: "Complete a task",
  delete_task: "Delete a task",
};

interface ApprovalCardProps {
  approval: Approval;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function ApprovalCard({ approval, onApprove, onReject }: ApprovalCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  if (approval.status !== "pending") {
    return (
      <Card className="border-zinc-300 opacity-60">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`h-2 w-2 rounded-full ${
              approval.status === "approved" ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="font-medium">
            {TOOL_DESCRIPTIONS[approval.toolName] ?? approval.toolName}
          </span>
          <span className="text-zinc-500">
            {approval.status === "approved" ? "Approved" : "Rejected"}
          </span>
        </div>
      </Card>
    );
  }

  const handleAction = async (approved: boolean) => {
    setIsLoading(true);
    if (approved) {
      onApprove(approval.id);
    } else {
      onReject(approval.id);
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Approval Required
          </span>
        </div>

        <p className="text-sm text-amber-900 dark:text-amber-100">
          {TOOL_DESCRIPTIONS[approval.toolName] ?? approval.toolName}
        </p>

        <div className="rounded-md bg-white/50 p-2 dark:bg-zinc-800/50">
          <pre className="overflow-x-auto text-xs text-zinc-700 dark:text-zinc-300">
            {JSON.stringify(approval.toolArgs, null, 2)}
          </pre>
        </div>

        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleAction(true)}
            disabled={isLoading}
          >
            Approve
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleAction(false)}
            disabled={isLoading}
          >
            Reject
          </Button>
        </div>
      </div>
    </Card>
  );
}

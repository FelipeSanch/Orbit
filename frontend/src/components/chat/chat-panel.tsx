"use client";

import { useCallback } from "react";
import { ChatInput } from "./chat-input";
import { MessageList } from "./message-list";
import { ApprovalCard } from "@/components/approval/approval-card";
import { useSSE } from "@/hooks/use-sse";
import { sendChatMessage, approveAction } from "@/lib/api";
import { useActivityStore } from "@/stores/activity-store";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import type { SSEEventType } from "@/types/events";

export function ChatPanel() {
  const session = useAuthStore((s) => s.session);
  const {
    messages,
    streamingContent,
    isStreaming,
    currentConversationId,
    currentSessionId,
    pendingApprovals,
    addMessage,
    appendDelta,
    finishStream,
    startStreaming,
    setConversationId,
    addApproval,
    resolveApproval,
  } = useChatStore();

  const addActivity = useActivityStore((s) => s.addActivity);

  const handleEvent = useCallback(
    (event: { type: SSEEventType; data: Record<string, unknown> }) => {
      switch (event.type) {
        case "stream_start":
          if (event.data.conversation_id) {
            setConversationId(event.data.conversation_id as string);
          }
          break;

        case "content_delta":
          appendDelta(event.data.delta as string);
          break;

        case "content_done":
          finishStream(event.data.full_content as string);
          break;

        case "tool_call":
          addActivity({
            id: crypto.randomUUID(),
            type: "tool_call",
            data: event.data,
            timestamp: new Date().toISOString(),
          });
          break;

        case "tool_result":
          addActivity({
            id: crypto.randomUUID(),
            type: "tool_result",
            data: event.data,
            timestamp: new Date().toISOString(),
          });
          break;

        case "approval_required":
          addApproval({
            id: event.data.approval_id as string,
            toolName: event.data.tool_name as string,
            toolArgs: event.data.tool_args as Record<string, unknown>,
            toolCallId: event.data.tool_call_id as string,
            runId: event.data.run_id as string,
            status: "pending",
          });
          addActivity({
            id: crypto.randomUUID(),
            type: "approval_required",
            data: event.data,
            timestamp: new Date().toISOString(),
          });
          break;

        case "agent_delegation":
          addActivity({
            id: crypto.randomUUID(),
            type: "agent_delegation",
            data: event.data,
            timestamp: new Date().toISOString(),
          });
          break;

        case "error":
          finishStream(`Error: ${event.data.message}`);
          break;
      }
    },
    [addActivity, addApproval, appendDelta, finishStream, setConversationId],
  );

  const { connect } = useSSE(handleEvent);

  const handleSend = (content: string) => {
    if (!session?.access_token) return;

    addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    });

    startStreaming();

    const stream = sendChatMessage(
      content,
      currentConversationId,
      currentSessionId,
      session.access_token,
    );

    connect(stream);
  };

  const handleApprove = async (approvalId: string) => {
    if (!session?.access_token) return;
    await approveAction(approvalId, true, session.access_token);
    resolveApproval(approvalId, "approved");
    addActivity({
      id: crypto.randomUUID(),
      type: "approval_approved",
      data: { approval_id: approvalId },
      timestamp: new Date().toISOString(),
    });
  };

  const handleReject = async (approvalId: string) => {
    if (!session?.access_token) return;
    await approveAction(approvalId, false, session.access_token);
    resolveApproval(approvalId, "rejected");
    addActivity({
      id: crypto.randomUUID(),
      type: "approval_rejected",
      data: { approval_id: approvalId },
      timestamp: new Date().toISOString(),
    });
  };

  return (
    <div className="flex h-full flex-col">
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
      />

      {pendingApprovals.filter((a) => a.status === "pending").length > 0 && (
        <div className="flex flex-col gap-2 border-t border-zinc-200 p-4 dark:border-zinc-700">
          {pendingApprovals
            .filter((a) => a.status === "pending")
            .map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))}
        </div>
      )}

      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}

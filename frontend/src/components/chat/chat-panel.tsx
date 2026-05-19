"use client";

import { useCallback, useState } from "react";
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
  const [inputValue, setInputValue] = useState("");

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

        case "stream_end":
          // Safety net: if stream ends without content_done (e.g. rejected
          // action with no continuation text), still clear the streaming
          // indicator so the UI doesn't hang.
          useChatStore.getState().isStreaming &&
            useChatStore.setState({ isStreaming: false, streamingContent: "" });
          break;

        case "error": {
          const raw = String(event.data.message ?? "");
          let friendly: string;
          if (/Failed to fetch|NetworkError|ECONNREFUSED/i.test(raw)) {
            friendly =
              "Couldn't reach the server. Check that the backend is running and try again.";
          } else if (/rate limit|429/i.test(raw)) {
            friendly =
              "Slow down — too many requests right now. Try again in a moment.";
          } else if (/Microsoft account not connected/i.test(raw)) {
            friendly =
              "Microsoft isn't connected yet. Open Settings and connect your account to use email, calendar, or tasks.";
          } else if (/Paused run not found|no_run|no_session/i.test(raw)) {
            friendly =
              "That approval request expired. Send your message again to retry.";
          } else {
            friendly = raw || "Something went wrong. Please try again.";
          }
          finishStream(friendly);
          break;
        }
      }
    },
    [addActivity, addApproval, appendDelta, finishStream, setConversationId],
  );

  const { connect } = useSSE(handleEvent);

  const handleSend = (content: string) => {
    if (!session?.token) return;

    addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    });

    const controller = new AbortController();
    startStreaming(controller);

    const stream = sendChatMessage(
      content,
      currentConversationId,
      session.token,
      controller.signal,
    );

    connect(stream);
  };

  const handleSuggestionClick = (text: string) => {
    handleSend(text);
  };

  const resolveAndContinue = (approvalId: string, approved: boolean) => {
    if (!session?.token) return;
    resolveApproval(approvalId, approved ? "approved" : "rejected");
    addActivity({
      id: crypto.randomUUID(),
      type: approved ? "approval_approved" : "approval_rejected",
      data: { approval_id: approvalId },
      timestamp: new Date().toISOString(),
    });
    const controller = new AbortController();
    startStreaming(controller);
    const stream = approveAction(approvalId, approved, session.token);
    connect(stream);
  };

  const handleApprove = (approvalId: string) => resolveAndContinue(approvalId, true);
  const handleReject = (approvalId: string) => resolveAndContinue(approvalId, false);

  return (
    <div className="flex h-full flex-col">
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
        onSuggestionClick={handleSuggestionClick}
      />

      {pendingApprovals.filter((a) => a.status === "pending").length > 0 && (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 border-t border-border px-4 py-3 sm:px-6">
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

      <ChatInput
        onSend={handleSend}
        disabled={isStreaming}
        value={inputValue}
        onChange={setInputValue}
      />
    </div>
  );
}

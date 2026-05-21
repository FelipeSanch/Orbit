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
  const resolveApprovalByToolCallId = useChatStore(
    (s) => s.resolveApprovalByToolCallId,
  );
  const [inputValue, setInputValue] = useState("");

  // tool_result.result is either a JSON envelope (success: {"status":"sent",...};
  // error: {"error":"...","code":"graph_..."}) or a raw "Error: ..." string.
  // Return [isError, friendlyMessage].
  const isErrorResult = (raw: string): [boolean, string | undefined] => {
    if (!raw) return [false, undefined];
    if (raw.startsWith("Error:")) return [true, raw.slice(7).trim()];
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "error" in parsed) {
        return [true, String(parsed.error)];
      }
    } catch {
      // not JSON; fall through
    }
    return [false, undefined];
  };

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

        case "tool_result": {
          addActivity({
            id: crypto.randomUUID(),
            type: "tool_result",
            data: event.data,
            timestamp: new Date().toISOString(),
          });
          // Phase H: this is the real success signal — the tool actually
          // ran (or actually errored). Drive any in_flight approval card
          // from this event instead of trusting the /approve 200 OK.
          const tcid = event.data.tool_call_id as string | undefined;
          const result = String(event.data.result ?? "");
          if (tcid) {
            const [errored, msg] = isErrorResult(result);
            resolveApprovalByToolCallId(
              tcid,
              errored ? "failed" : "approved",
              msg,
            );
          }
          break;
        }

        case "tool_progress":
          // Surfaced when a tool call hasn't completed within the
          // configured threshold (default 5s, tunable from server data).
          // Routed to the activity feed so the user sees the call is
          // still in flight; no chat-stream interruption.
          addActivity({
            id: crypto.randomUUID(),
            type: "tool_progress",
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
          // Backend emits a typed envelope {code, user_message}. Switch on
          // code instead of regex-matching free-form text. user_message is
          // the source of truth for what to show; only fall back to a
          // per-code default if the backend omitted it.
          const code = String(event.data.code ?? "");
          const userMessage = String(event.data.user_message ?? "");
          const defaults: Record<string, string> = {
            session_expired:
              "Your session expired. Please sign in again.",
            run_error:
              "Something went wrong on our side. Please try again.",
            resume_error:
              "Couldn't complete that action. Please try again.",
            graph_throttled:
              "Microsoft is rate-limiting requests. Try again shortly.",
            graph_timeout:
              "Microsoft Graph took too long to respond. The action may still have completed on their side.",
            graph_error:
              "Microsoft Graph returned an error. Please try again.",
            microsoft_not_connected:
              "Microsoft isn't connected yet. Open Settings and connect your account to use email, calendar, or tasks.",
            google_not_connected:
              "Google Calendar isn't connected yet. Open Settings to connect it.",
            rate_limited:
              "Slow down — too many requests right now. Try again in a moment.",
            daily_cap_reached:
              "You've hit your daily usage cap. Resets at 00:00 UTC.",
          };
          const friendly =
            userMessage ||
            defaults[code] ||
            "Something went wrong. Please try again.";
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
    // Phase H: on Send, mark in_flight — the real "approved" flip comes
    // from the tool_result SSE event so the green check only appears
    // when Graph actually accepted the write. On Reject there's no tool
    // result to wait for; mark rejected immediately.
    resolveApproval(approvalId, approved ? "in_flight" : "rejected");
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

      {pendingApprovals.filter(
        (a) =>
          a.status === "pending" ||
          a.status === "in_flight" ||
          a.status === "failed",
      ).length > 0 && (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 border-t border-border px-4 py-3 sm:px-6">
          {pendingApprovals
            .filter(
              (a) =>
                a.status === "pending" ||
                a.status === "in_flight" ||
                a.status === "failed",
            )
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

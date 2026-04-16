export type SSEEventType =
  | "stream_start"
  | "content_delta"
  | "content_done"
  | "tool_call"
  | "tool_result"
  | "approval_required"
  | "agent_delegation"
  | "error"
  | "stream_end";

export interface StreamStartEvent {
  run_id: string;
  conversation_id: string;
}

export interface ContentDeltaEvent {
  delta: string;
}

export interface ContentDoneEvent {
  full_content: string;
}

export interface ToolCallEvent {
  tool_name: string;
  tool_args: Record<string, unknown>;
  tool_call_id: string;
}

export interface ToolResultEvent {
  tool_call_id: string;
  result: string;
}

export interface ApprovalRequiredEvent {
  approval_id: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  tool_call_id: string;
  run_id: string;
}

export interface AgentDelegationEvent {
  to_agent: string;
  task: string;
}

export interface ErrorEvent {
  message: string;
  code: string;
}

export interface StreamEndEvent {
  run_id: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface Approval {
  id: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolCallId: string;
  runId: string;
  status: "pending" | "approved" | "rejected";
}

export interface ActivityItem {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

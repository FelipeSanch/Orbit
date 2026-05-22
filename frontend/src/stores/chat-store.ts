"use client";

import { create } from "zustand";
import type {
  Approval,
  ApprovalStatus,
  Conversation,
  Message,
  StructuredData,
} from "@/types/events";

interface ChatState {
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  currentConversationId: string | null;
  pendingApprovals: Approval[];
  conversations: Conversation[];
  activeAbortController: AbortController | null;
  // Per-turn cache: the most recent tool_result that parsed as a known
  // list shape (emails/events/tasks). Reset on startStreaming, attached
  // to the assistant message on finishStream so the bubble can render
  // cards below the prose.
  pendingStructuredData: StructuredData | null;

  addMessage: (message: Message) => void;
  appendDelta: (delta: string) => void;
  finishStream: (fullContent: string, kind?: "error") => void;
  setPendingStructuredData: (data: StructuredData | null) => void;
  startStreaming: (controller: AbortController) => void;
  abortStream: () => void;
  setConversationId: (id: string) => void;
  addApproval: (approval: Approval) => void;
  resolveApproval: (
    id: string,
    status: ApprovalStatus,
    failureMessage?: string,
  ) => void;
  resolveApprovalByToolCallId: (
    toolCallId: string,
    status: ApprovalStatus,
    failureMessage?: string,
  ) => void;
  loadMessages: (messages: Message[]) => void;
  setConversations: (conversations: Conversation[]) => void;
  selectConversation: (id: string) => void;
  removeConversation: (id: string) => void;
  renameConversationLocal: (id: string, title: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streamingContent: "",
  isStreaming: false,
  currentConversationId: null,
  pendingApprovals: [],
  conversations: [],
  activeAbortController: null,
  pendingStructuredData: null,

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  appendDelta: (delta) =>
    set((state) => ({
      streamingContent: state.streamingContent + delta,
    })),

  setPendingStructuredData: (data) => set({ pendingStructuredData: data }),

  startStreaming: (controller) =>
    set({
      isStreaming: true,
      streamingContent: "",
      activeAbortController: controller,
      pendingStructuredData: null,
    }),

  abortStream: () => {
    const c = get().activeAbortController;
    if (c) c.abort();
    set({
      isStreaming: false,
      streamingContent: "",
      activeAbortController: null,
    });
  },

  finishStream: (fullContent, kind) =>
    set((state) => ({
      isStreaming: false,
      streamingContent: "",
      activeAbortController: null,
      pendingStructuredData: null,
      messages: [
        ...state.messages,
        {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: fullContent,
          createdAt: new Date().toISOString(),
          ...(kind ? { kind } : {}),
          ...(state.pendingStructuredData
            ? { structuredData: state.pendingStructuredData }
            : {}),
        },
      ],
    })),

  setConversationId: (id) => set({ currentConversationId: id }),

  addApproval: (approval) =>
    set((state) => {
      const argsSignature = JSON.stringify(approval.toolArgs);
      const alreadyPending = state.pendingApprovals.some(
        (a) =>
          a.status === "pending" &&
          a.toolName === approval.toolName &&
          JSON.stringify(a.toolArgs) === argsSignature,
      );
      if (alreadyPending) return state;
      return { pendingApprovals: [...state.pendingApprovals, approval] };
    }),

  resolveApproval: (id, status, failureMessage) =>
    set((state) => ({
      pendingApprovals: state.pendingApprovals.map((a) =>
        a.id === id ? { ...a, status, failureMessage } : a,
      ),
    })),

  // Used by the SSE tool_result handler — the approval id isn't in the
  // event payload, but the tool_call_id is, so we resolve by that.
  // Only flips in_flight rows so a stale tool_result doesn't reopen
  // an already-resolved approval.
  resolveApprovalByToolCallId: (toolCallId, status, failureMessage) =>
    set((state) => ({
      pendingApprovals: state.pendingApprovals.map((a) =>
        a.toolCallId === toolCallId && a.status === "in_flight"
          ? { ...a, status, failureMessage }
          : a,
      ),
    })),

  loadMessages: (messages) => set({ messages }),

  setConversations: (conversations) => set({ conversations }),

  selectConversation: (id) => {
    const current = get();
    if (current.activeAbortController) current.activeAbortController.abort();
    set({
      currentConversationId: id,
      messages: [],
      streamingContent: "",
      isStreaming: false,
      pendingApprovals: [],
      activeAbortController: null,
    });
  },

  renameConversationLocal: (id, title) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c,
      ),
    })),

  removeConversation: (id) =>
    set((state) => {
      const remaining = state.conversations.filter((c) => c.id !== id);
      const wasActive = state.currentConversationId === id;
      if (wasActive && state.activeAbortController) {
        state.activeAbortController.abort();
      }
      return {
        conversations: remaining,
        ...(wasActive && {
          currentConversationId: null,
          messages: [],
          streamingContent: "",
          isStreaming: false,
          pendingApprovals: [],
          activeAbortController: null,
        }),
      };
    }),

  reset: () => {
    const current = get();
    if (current.activeAbortController) current.activeAbortController.abort();
    set({
      messages: [],
      streamingContent: "",
      isStreaming: false,
      currentConversationId: null,
      pendingApprovals: [],
      activeAbortController: null,
    });
  },
}));

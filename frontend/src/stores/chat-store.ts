"use client";

import { create } from "zustand";
import type { Approval, Conversation, Message } from "@/types/events";

interface ChatState {
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  currentConversationId: string | null;
  pendingApprovals: Approval[];
  conversations: Conversation[];
  activeAbortController: AbortController | null;

  addMessage: (message: Message) => void;
  appendDelta: (delta: string) => void;
  finishStream: (fullContent: string) => void;
  startStreaming: (controller: AbortController) => void;
  abortStream: () => void;
  setConversationId: (id: string) => void;
  addApproval: (approval: Approval) => void;
  resolveApproval: (id: string, status: "approved" | "rejected") => void;
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

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  appendDelta: (delta) =>
    set((state) => ({
      streamingContent: state.streamingContent + delta,
    })),

  startStreaming: (controller) =>
    set({
      isStreaming: true,
      streamingContent: "",
      activeAbortController: controller,
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

  finishStream: (fullContent) =>
    set((state) => ({
      isStreaming: false,
      streamingContent: "",
      activeAbortController: null,
      messages: [
        ...state.messages,
        {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: fullContent,
          createdAt: new Date().toISOString(),
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

  resolveApproval: (id, status) =>
    set((state) => ({
      pendingApprovals: state.pendingApprovals.map((a) =>
        a.id === id ? { ...a, status } : a,
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

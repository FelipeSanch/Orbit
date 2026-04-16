"use client";

import { create } from "zustand";
import type { Approval, Message } from "@/types/events";

interface ChatState {
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  currentConversationId: string | null;
  currentSessionId: string;
  pendingApprovals: Approval[];

  addMessage: (message: Message) => void;
  appendDelta: (delta: string) => void;
  finishStream: (fullContent: string) => void;
  startStreaming: () => void;
  setConversationId: (id: string) => void;
  addApproval: (approval: Approval) => void;
  resolveApproval: (id: string, status: "approved" | "rejected") => void;
  loadMessages: (messages: Message[]) => void;
  reset: () => void;
}

function generateSessionId(): string {
  return crypto.randomUUID();
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  streamingContent: "",
  isStreaming: false,
  currentConversationId: null,
  currentSessionId: generateSessionId(),
  pendingApprovals: [],

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  appendDelta: (delta) =>
    set((state) => ({
      streamingContent: state.streamingContent + delta,
    })),

  startStreaming: () => set({ isStreaming: true, streamingContent: "" }),

  finishStream: (fullContent) =>
    set((state) => ({
      isStreaming: false,
      streamingContent: "",
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
    set((state) => ({
      pendingApprovals: [...state.pendingApprovals, approval],
    })),

  resolveApproval: (id, status) =>
    set((state) => ({
      pendingApprovals: state.pendingApprovals.map((a) =>
        a.id === id ? { ...a, status } : a,
      ),
    })),

  loadMessages: (messages) => set({ messages }),

  reset: () =>
    set({
      messages: [],
      streamingContent: "",
      isStreaming: false,
      currentConversationId: null,
      currentSessionId: generateSessionId(),
      pendingApprovals: [],
    }),
}));

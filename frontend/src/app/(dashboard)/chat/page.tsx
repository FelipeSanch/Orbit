"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { useChatStore } from "@/stores/chat-store";
import { useAuthStore } from "@/stores/auth-store";

export default function DashboardPage() {
  const conversationId = useChatStore((s) => s.currentConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const messagesCount = useChatStore((s) => s.messages.length);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeApprovalCount = useChatStore(
    (s) =>
      s.pendingApprovals.filter(
        (a) => a.status === "pending" || a.status === "in_flight",
      ).length,
  );
  const isMicrosoftConnected = useAuthStore((s) => s.isMicrosoftConnected);

  const currentTitle = conversations.find(
    (c) => c.id === conversationId,
  )?.title;

  // Activity panel: collapsed by default so the chat takes the full
  // canvas. Auto-opens while there's actual activity (streaming or a
  // pending/in-flight approval), and the user's manual toggle wins for
  // the rest of the session. Without this, "No activity yet" was
  // permanently occupying ~25% of horizontal real estate.
  const [activityOpen, setActivityOpen] = useState(false);
  useEffect(() => {
    if (isStreaming || activeApprovalCount > 0) setActivityOpen(true);
  }, [isStreaming, activeApprovalCount]);

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border pl-16 pr-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground sm:max-w-[300px]">
            {currentTitle ?? (messagesCount > 0 ? "Chat" : "New Chat")}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isMicrosoftConnected && (
            <div className="hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 sm:flex">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                Connected
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setActivityOpen((o) => !o)}
            className={`hidden h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors lg:flex ${
              activityOpen
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border bg-surface text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={activityOpen}
            title={activityOpen ? "Hide activity panel" : "Show activity panel"}
          >
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
              />
            </svg>
            Activity
            {(isStreaming || activeApprovalCount > 0) && (
              <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col">
          <ChatPanel />
        </div>
        {/* Activity drawer — hidden by default, slides in via width
            transition when the user opens it or a live run starts. */}
        <div
          className={`hidden shrink-0 overflow-hidden border-l border-border transition-[width] duration-200 ease-out lg:block ${
            activityOpen ? "w-80" : "w-0 border-l-0"
          }`}
        >
          <div className="h-full w-80">
            <ActivityFeed />
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { ChatPanel } from "@/components/chat/chat-panel";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { useChatStore } from "@/stores/chat-store";
import { useAuthStore } from "@/stores/auth-store";

export default function DashboardPage() {
  const conversationId = useChatStore((s) => s.currentConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const messagesCount = useChatStore((s) => s.messages.length);
  const isMicrosoftConnected = useAuthStore((s) => s.isMicrosoftConnected);

  const currentTitle = conversations.find(
    (c) => c.id === conversationId,
  )?.title;

  return (
    <div className="flex h-full flex-1 flex-col">
      {/* Chat header bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-foreground truncate max-w-[300px]">
            {currentTitle ?? (messagesCount > 0 ? "Chat" : "New Chat")}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {isMicrosoftConnected && (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                Connected
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col">
          <ChatPanel />
        </div>
        <div className="hidden w-80 border-l border-border lg:block">
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}

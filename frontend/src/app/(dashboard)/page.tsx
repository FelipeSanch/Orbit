import { ChatPanel } from "@/components/chat/chat-panel";
import { ActivityFeed } from "@/components/activity/activity-feed";

export default function DashboardPage() {
  return (
    <div className="flex h-full flex-1">
      <div className="flex flex-1 flex-col">
        <ChatPanel />
      </div>
      <div className="hidden w-80 border-l border-zinc-200 dark:border-zinc-700 lg:block">
        <ActivityFeed />
      </div>
    </div>
  );
}

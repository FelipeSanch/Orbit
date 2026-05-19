"use client";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { useActivityStore } from "@/stores/activity-store";

export default function ActivityPage() {
  const activities = useActivityStore((s) => s.activities);
  const clearActivities = useActivityStore((s) => s.clearActivities);

  const toolCalls = activities.filter((a) => a.type === "tool_call").length;
  const approvals = activities.filter((a) =>
    a.type.startsWith("approval_"),
  ).length;
  const delegations = activities.filter(
    (a) => a.type === "agent_delegation",
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex h-14 items-center justify-between border-b border-border px-6">
        <h1 className="text-sm font-semibold text-foreground">Activity Log</h1>
        {activities.length > 0 && (
          <button
            onClick={clearActivities}
            className="cursor-pointer text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Stats bar */}
      {activities.length > 0 && (
        <div className="flex gap-4 border-b border-border px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-[12px] text-muted-foreground">
              <span className="font-semibold text-foreground">{toolCalls}</span>{" "}
              tool calls
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-[12px] text-muted-foreground">
              <span className="font-semibold text-foreground">{approvals}</span>{" "}
              approvals
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-violet-500" />
            <span className="text-[12px] text-muted-foreground">
              <span className="font-semibold text-foreground">
                {delegations}
              </span>{" "}
              delegations
            </span>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        <ActivityFeed />
      </div>
    </div>
  );
}

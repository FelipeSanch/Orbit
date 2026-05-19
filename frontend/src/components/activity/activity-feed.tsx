"use client";

import { useActivityStore } from "@/stores/activity-store";
import { ActivityItemCard } from "./activity-item";

export function ActivityFeed() {
  const activities = useActivityStore((s) => s.activities);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <h2 className="text-[13px] font-semibold text-foreground">Activity</h2>
        {activities.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/10 px-1.5 text-[10px] font-semibold text-accent">
            {activities.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activities.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <svg
                className="h-5 w-5 text-muted-foreground/40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                />
              </svg>
            </div>
            <div className="flex flex-col items-center gap-1">
              <p className="text-[13px] font-medium text-muted-foreground">
                No activity yet
              </p>
              <p className="max-w-48 text-center text-[11px] leading-relaxed text-muted-foreground/60">
                Activity will appear here as Orbit processes your requests.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col p-2">
            {activities.map((item, i) => (
              <div key={item.id} className="relative">
                {i < activities.length - 1 && (
                  <div className="absolute left-[23px] top-8 bottom-0 w-px bg-border" />
                )}
                <ActivityItemCard item={item} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

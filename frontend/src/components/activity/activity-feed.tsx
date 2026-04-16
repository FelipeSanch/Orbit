"use client";

import { useActivityStore } from "@/stores/activity-store";
import { ActivityItemCard } from "./activity-item";

export function ActivityFeed() {
  const activities = useActivityStore((s) => s.activities);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Activity
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activities.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <p className="text-xs text-zinc-400">
              Activity will appear here as the assistant works.
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
            {activities.map((item) => (
              <ActivityItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

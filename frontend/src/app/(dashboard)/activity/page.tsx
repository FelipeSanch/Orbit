"use client";

import { ActivityFeed } from "@/components/activity/activity-feed";

export default function ActivityPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-zinc-200 px-8 py-4 dark:border-zinc-700">
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <p className="mt-1 text-sm text-zinc-500">
          See everything Orbit has done on your behalf.
        </p>
      </div>
      <div className="flex-1">
        <ActivityFeed />
      </div>
    </div>
  );
}

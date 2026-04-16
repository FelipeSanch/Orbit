import type { ActivityItem as ActivityItemType } from "@/types/events";

const ICON_MAP: Record<string, string> = {
  tool_call:
    "M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085",
  approval_required:
    "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  approval_approved: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  approval_rejected: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
  agent_delegation: "M13 10V3L4 14h7v7l9-11h-7z",
};

interface ActivityItemProps {
  item: ActivityItemType;
}

export function ActivityItemCard({ item }: ActivityItemProps) {
  const iconPath = ICON_MAP[item.type] ?? ICON_MAP.tool_call;
  const data = item.data;

  let label = item.type;
  if (item.type === "tool_call" && data.tool_name) {
    label = String(data.tool_name).replace(/_/g, " ");
  } else if (item.type === "agent_delegation" && data.to_agent) {
    label = `Delegated to ${data.to_agent}`;
  } else if (item.type.startsWith("approval_")) {
    label = item.type.replace(/_/g, " ");
  }

  return (
    <div className="flex items-start gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
      </svg>
      <div className="flex flex-col gap-0.5">
        <span className="font-medium capitalize text-zinc-700 dark:text-zinc-300">
          {label}
        </span>
        <span className="text-xs text-zinc-400">
          {new Date(item.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

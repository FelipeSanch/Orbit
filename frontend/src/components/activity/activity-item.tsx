import type { ActivityItem as ActivityItemType } from "@/types/events";

const EVENT_STYLES: Record<
  string,
  { icon: string; color: string; bg: string }
> = {
  tool_call: {
    icon: "M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  tool_result: {
    icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  approval_required: {
    icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  approval_approved: {
    icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  approval_rejected: {
    icon: "M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    color: "text-red-500",
    bg: "bg-red-500/10",
  },
  agent_delegation: {
    icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
    color: "text-violet-500",
    bg: "bg-violet-500/10",
  },
};

interface ActivityItemProps {
  item: ActivityItemType;
}

function toolDomain(name: string): "email" | "calendar" | "tasks" | null {
  if (name.includes("email") || name.includes("mail")) return "email";
  if (name.includes("event") || name.includes("calendar")) return "calendar";
  if (name.includes("task")) return "tasks";
  return null;
}

const DOMAIN_STYLES = {
  email: { color: "text-sky-500", bg: "bg-sky-500/10" },
  calendar: { color: "text-emerald-500", bg: "bg-emerald-500/10" },
  tasks: { color: "text-amber-500", bg: "bg-amber-500/10" },
} as const;

export function ActivityItemCard({ item }: ActivityItemProps) {
  let style = EVENT_STYLES[item.type] ?? EVENT_STYLES.tool_call;
  const data = item.data;

  let label = item.type;
  let detail = "";

  if (item.type === "tool_call" && data.tool_name) {
    const name = String(data.tool_name);
    label = name.replace(/_/g, " ");
    detail = "Executing";
    const domain = toolDomain(name);
    if (domain) style = { ...style, ...DOMAIN_STYLES[domain] };
  } else if (item.type === "tool_result") {
    label = "Result received";
    detail = "Tool completed";
  } else if (item.type === "agent_delegation" && data.to_agent) {
    label = String(data.to_agent);
    detail = "Delegated";
  } else if (item.type === "approval_required") {
    label = "Approval needed";
    detail = String(data.tool_name ?? "").replace(/_/g, " ");
  } else if (item.type === "approval_approved") {
    label = "Approved";
    detail = "Action confirmed";
  } else if (item.type === "approval_rejected") {
    label = "Rejected";
    detail = "Action denied";
  }

  return (
    <div className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${style.bg}`}
      >
        <svg
          className={`h-3.5 w-3.5 ${style.color}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={style.icon} />
        </svg>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[12px] font-medium capitalize text-foreground">
          {label}
        </span>
        {detail && (
          <span className="text-[11px] text-muted-foreground">{detail}</span>
        )}
      </div>
      <span className="shrink-0 pt-0.5 text-[10px] text-muted-foreground/60">
        {new Date(item.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
}

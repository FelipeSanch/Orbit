"use client";

import type {
  EmailItem,
  EventItem,
  StructuredData,
  TaskItem,
} from "@/types/events";
import { providerLabel } from "@/lib/parse-tool-result";

/**
 * Compact cards rendered under an assistant message when the turn's
 * last tool_result was a list (emails, events, tasks). The agent's
 * one-line summary still appears above (e.g. "5 unread, all from
 * LinkedIn") — these cards are the structured layer.
 */
export function StructuredCards({ data }: { data: StructuredData }) {
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {providerLabel(data.provider)} ·{" "}
        {data.items.length}{" "}
        {data.kind === "emails"
          ? data.items.length === 1
            ? "email"
            : "emails"
          : data.kind === "events"
            ? data.items.length === 1
              ? "event"
              : "events"
            : data.items.length === 1
              ? "task"
              : "tasks"}
      </div>
      {data.kind === "emails" && <EmailCards items={data.items} />}
      {data.kind === "events" && <EventCards items={data.items} />}
      {data.kind === "tasks" && <TaskCards items={data.items} />}
    </div>
  );
}

function EmailCards({ items }: { items: EmailItem[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((e) => (
        <EmailCard key={e.id} email={e} />
      ))}
    </div>
  );
}

function EmailCard({ email }: { email: EmailItem }) {
  const { name, address } = parseSender(email.from);
  const initials = avatarInitials(name || address);
  const unread = email.is_read === false;
  return (
    <div className="group flex items-start gap-3 rounded-xl border border-border bg-surface-raised/70 px-3 py-2.5 transition-colors hover:border-accent/30 hover:bg-accent/5">
      <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-semibold text-accent">
        {initials}
        {unread && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate text-[13px] ${unread ? "font-semibold text-foreground" : "text-foreground/90"}`}
          >
            {name || address || "Unknown"}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground/70">
            {formatRelativeTime(email.date)}
          </span>
        </div>
        <div className="truncate text-[12px] text-foreground/80">
          {email.subject || "(no subject)"}
          {email.has_attachments && (
            <span className="ml-1.5 text-muted-foreground/60">📎</span>
          )}
        </div>
        {email.snippet && (
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
            {email.snippet}
          </div>
        )}
      </div>
    </div>
  );
}

function EventCards({ items }: { items: EventItem[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((e) => (
        <EventCard key={e.id} event={e} />
      ))}
    </div>
  );
}

function EventCard({ event }: { event: EventItem }) {
  const title = event.summary || event.title || "(untitled event)";
  const start = event.start_time || event.start;
  const end = event.end_time || event.end;
  return (
    <div className="group flex items-start gap-3 rounded-xl border border-border bg-surface-raised/70 px-3 py-2.5 transition-colors hover:border-accent/30 hover:bg-accent/5">
      <div className="flex h-7 w-7 shrink-0 flex-col items-center justify-center rounded-lg bg-accent/15 text-accent">
        <span className="text-[8px] font-medium uppercase tracking-wider opacity-70">
          {start ? new Date(start).toLocaleDateString(undefined, { month: "short" }) : ""}
        </span>
        <span className="-mt-0.5 text-[12px] font-bold leading-none">
          {start ? new Date(start).getDate() : "?"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-foreground">
          {title}
        </div>
        <div className="text-[11px] text-muted-foreground/80">
          {formatEventTime(start, end)}
          {event.location && (
            <span className="ml-1.5 text-muted-foreground/60">
              · {event.location}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskCards({ items }: { items: TaskItem[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}
    </div>
  );
}

function TaskCard({ task }: { task: TaskItem }) {
  const done =
    task.status === "completed" || task.status === "done";
  const due = task.due_date || task.due;
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border bg-surface-raised/70 px-3 py-2.5 transition-colors hover:border-accent/30 hover:bg-accent/5">
      <div
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          done
            ? "border-accent bg-accent text-accent-foreground"
            : "border-border"
        }`}
      >
        {done && (
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-[13px] ${done ? "text-muted-foreground line-through" : "text-foreground"}`}
        >
          {task.title}
        </div>
        {due && (
          <div className="text-[11px] text-muted-foreground/70">
            Due {formatRelativeTime(due)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── helpers ───────────────────────────────────────────────────── */

function parseSender(raw: string): { name: string; address: string } {
  if (!raw) return { name: "", address: "" };
  // "Name <addr@example.com>" or just "addr@example.com"
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim(), address: match[2] };
  return { name: "", address: raw };
}

function avatarInitials(s: string): string {
  if (!s) return "?";
  const parts = s.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return s.slice(0, 2).toUpperCase();
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  // Beyond a week — show absolute short date
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatEventTime(start?: string, end?: string): string {
  if (!start) return "";
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return "";
  const startStr = s.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (!end) return startStr;
  const e = new Date(end);
  if (Number.isNaN(e.getTime())) return startStr;
  const endStr = e.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${startStr} – ${endStr}`;
}

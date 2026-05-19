"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Approval } from "@/types/events";

const TOOL_LABELS: Record<string, string> = {
  send_email: "Send email",
  reply_to_email: "Reply to email",
  trash_email: "Move email to trash",
  move_email: "Move email",
  create_event: "Create calendar event",
  update_event: "Update calendar event",
  delete_event: "Delete calendar event",
  create_task: "Create task",
  update_task: "Update task",
  complete_task: "Complete task",
  delete_task: "Delete task",
};

const ICONS: Record<string, string> = {
  send_email:
    "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75",
  reply_to_email:
    "M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3",
  create_event:
    "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  create_task:
    "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

function EmailPreview({
  args,
}: {
  args: Record<string, unknown>;
}) {
  const to = String(args.to ?? "");
  const subject = String(args.subject ?? "");
  const body = String(args.body ?? "");
  const cc = String(args.cc ?? "");
  return (
    <div className="flex flex-col gap-2 text-[13px] leading-relaxed">
      <PreviewRow label="To" value={to || "—"} />
      {cc && <PreviewRow label="Cc" value={cc} />}
      <PreviewRow label="Subject" value={subject || "—"} />
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Body
        </span>
        <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-surface-raised/40 px-3 py-2 text-[13px] text-foreground">
          {body || <span className="text-muted-foreground italic">(empty)</span>}
        </div>
      </div>
    </div>
  );
}

function EventPreview({
  args,
}: {
  args: Record<string, unknown>;
}) {
  const summary = String(args.summary ?? args.title ?? "");
  const start = String(args.start_time ?? args.start ?? "");
  const end = String(args.end_time ?? args.end ?? "");
  const location = String(args.location ?? "");
  const attendees = String(args.attendees ?? "");
  return (
    <div className="flex flex-col gap-2 text-[13px] leading-relaxed">
      <PreviewRow label="Title" value={summary || "—"} />
      {start && <PreviewRow label="Start" value={formatWhen(start)} />}
      {end && <PreviewRow label="End" value={formatWhen(end)} />}
      {location && <PreviewRow label="Location" value={location} />}
      {attendees && <PreviewRow label="Attendees" value={attendees} />}
    </div>
  );
}

function TaskPreview({ args }: { args: Record<string, unknown> }) {
  const title = String(args.title ?? "");
  const body = String(args.body ?? "");
  const due = String(args.due_date ?? "");
  return (
    <div className="flex flex-col gap-2 text-[13px] leading-relaxed">
      <PreviewRow label="Title" value={title || "—"} />
      {due && <PreviewRow label="Due" value={formatWhen(due)} />}
      {body && <PreviewRow label="Notes" value={body} />}
    </div>
  );
}

function GenericPreview({
  args,
}: {
  args: Record<string, unknown>;
}) {
  return (
    <pre className="max-h-48 overflow-auto rounded-md border border-border/60 bg-surface-raised/40 px-3 py-2 text-[12px] text-foreground">
      {JSON.stringify(args, null, 2)}
    </pre>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-[68px] shrink-0 pt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <span className="min-w-0 flex-1 break-words text-foreground">
        {value}
      </span>
    </div>
  );
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function renderPreview(
  toolName: string,
  args: Record<string, unknown>,
) {
  if (toolName === "send_email" || toolName === "reply_to_email") {
    return <EmailPreview args={args} />;
  }
  if (
    toolName === "create_event" ||
    toolName === "update_event"
  ) {
    return <EventPreview args={args} />;
  }
  if (toolName === "create_task" || toolName === "update_task") {
    return <TaskPreview args={args} />;
  }
  return <GenericPreview args={args} />;
}

interface ApprovalCardProps {
  approval: Approval;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function ApprovalCard({
  approval,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const label = TOOL_LABELS[approval.toolName] ?? approval.toolName;
  const iconPath = ICONS[approval.toolName] ?? ICONS.send_email;
  const primaryVerb =
    approval.toolName.startsWith("send_") || approval.toolName === "reply_to_email"
      ? "Send"
      : approval.toolName.startsWith("delete_") || approval.toolName === "trash_email"
        ? "Delete"
        : "Confirm";

  if (approval.status !== "pending") {
    const isApproved = approval.status === "approved";
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-surface px-4 py-2.5 text-[13px] text-muted-foreground">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isApproved ? "bg-emerald-500" : "bg-zinc-400"
          }`}
        />
        <span className="font-medium text-foreground">{label}</span>
        <span>·</span>
        <span>{isApproved ? "Approved" : "Rejected"}</span>
      </div>
    );
  }

  const handleAction = (approved: boolean) => {
    setIsLoading(true);
    if (approved) onApprove(approval.id);
    else onReject(approval.id);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={iconPath}
              />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-foreground">
              {label}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Needs your approval
            </span>
          </div>
        </div>
      </div>

      {/* Preview body */}
      <div className="px-4 py-3">{renderPreview(approval.toolName, approval.toolArgs)}</div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-surface-raised/30 px-3 py-2.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleAction(false)}
          disabled={isLoading}
          className="text-muted-foreground hover:text-foreground"
        >
          Reject
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => handleAction(true)}
          disabled={isLoading}
        >
          {isLoading ? "Working…" : primaryVerb}
        </Button>
      </div>
    </div>
  );
}

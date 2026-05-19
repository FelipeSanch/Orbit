"use client";

import type { ReactNode } from "react";

export type CardStatus = "connected" | "available" | "soon";

export interface SubItem {
  label: string;
  iconPath?: string; // optional Heroicon-style path
  meta?: string; // e.g. "12m ago", "23 unread"
}

interface IntegrationCardProps {
  name: string;
  category: string;
  description: string;
  icon: ReactNode;
  iconBg: string;
  status: CardStatus;
  subItems: SubItem[];
  onClick?: () => void;
}

const DEFAULT_SUB_ICON =
  "M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M3.75 8.25h16.5";

function StatusDot({ status }: { status: CardStatus }) {
  if (status === "connected") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span className="text-[11px] font-medium text-emerald-500">
          Connected
        </span>
      </span>
    );
  }
  if (status === "available") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
        <span className="text-[11px] text-muted-foreground">Available</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full border border-dashed border-muted-foreground/50" />
      <span className="text-[11px] text-muted-foreground/60">Coming soon</span>
    </span>
  );
}

export function IntegrationCard({
  name,
  category,
  description,
  icon,
  iconBg,
  status,
  subItems,
  onClick,
}: IntegrationCardProps) {
  const interactive = status !== "soon";

  return (
    <button
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      className={`group relative flex w-full flex-col overflow-visible rounded-xl border bg-surface/60 text-left backdrop-blur-sm transition-all duration-150 before:pointer-events-none before:absolute before:left-[calc(-1*var(--rail-extend,12px))] before:top-1/2 before:hidden before:h-px before:w-[var(--rail-extend,12px)] before:-translate-y-1/2 before:border-t before:border-dashed before:border-border/60 after:pointer-events-none after:absolute after:right-[calc(-1*var(--rail-extend,12px))] after:top-1/2 after:hidden after:h-px after:w-[var(--rail-extend,12px)] after:-translate-y-1/2 after:border-t after:border-dashed after:border-border/60 sm:before:block sm:after:block ${
        interactive
          ? "cursor-pointer border-border hover:border-accent/40 hover:bg-surface/80"
          : "cursor-default border-dashed border-border/50 opacity-65"
      }`}
      style={{ ["--rail-extend" as string]: "14px" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-3 pb-2">
        <div className="flex items-start gap-2.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: iconBg }}
          >
            {icon}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {category}
            </span>
            <span className="text-[13px] font-semibold leading-tight text-foreground">
              {name}
            </span>
          </div>
        </div>
        <StatusDot status={status} />
      </div>

      {/* Description */}
      <p className="px-3 pb-2.5 text-[11px] leading-snug text-muted-foreground">
        {description}
      </p>

      {/* Sub-items */}
      {subItems.length > 0 && (
        <div className="flex flex-col border-t border-border/60">
          {subItems.map((item, i) => (
            <div
              key={item.label}
              className={`flex items-center justify-between gap-2 px-3 py-1.5 ${
                i > 0 ? "border-t border-border/40" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <svg
                  className="h-3 w-3 shrink-0 text-muted-foreground/60"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={item.iconPath ?? DEFAULT_SUB_ICON}
                  />
                </svg>
                <span className="text-[11px] text-foreground/90">
                  {item.label}
                </span>
              </div>
              {item.meta && (
                <span className="text-[10px] text-muted-foreground/60">
                  {item.meta}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

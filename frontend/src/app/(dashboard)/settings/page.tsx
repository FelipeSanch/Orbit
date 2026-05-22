"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { env } from "@/lib/env";
import {
  deleteMemory,
  fetchMemories,
  fetchPreferences,
  fetchUsageToday,
  updatePreferences,
  type UsageToday,
} from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useTheme, type ThemePreference } from "@/lib/theme";

function SettingsContent() {
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const isMicrosoftConnected = useAuthStore((s) => s.isMicrosoftConnected);
  const setMicrosoftConnected = useAuthStore((s) => s.setMicrosoftConnected);
  const isGoogleConnected = useAuthStore((s) => s.isGoogleConnected);
  const setGoogleConnected = useAuthStore((s) => s.setGoogleConnected);
  const connectedCount = [isMicrosoftConnected, isGoogleConnected].filter(
    Boolean,
  ).length;
  const [usage, setUsage] = useState<UsageToday | null>(null);
  const [memories, setMemories] = useState<
    { id: string; memory: string; topics: string[]; updated_at: string | null }[]
  >([]);
  const searchParams = useSearchParams();

  const googleError =
    searchParams.get("google") === "error"
      ? searchParams.get("reason") ?? "unknown"
      : null;

  useEffect(() => {
    if (searchParams.get("microsoft") === "connected") {
      setMicrosoftConnected(true);
    }
    if (searchParams.get("google") === "connected") {
      setGoogleConnected(true);
    }
  }, [searchParams, setMicrosoftConnected, setGoogleConnected]);

  useEffect(() => {
    if (!session?.token) return;

    fetch(`${env.apiUrl}/api/auth/microsoft/status`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then((res) => res.json())
      .then((data) => setMicrosoftConnected(data.connected))
      .catch(() => {});

    fetch(`${env.apiUrl}/api/auth/google/status`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then((res) => res.json())
      .then((data) => setGoogleConnected(data.connected))
      .catch(() => {});
  }, [session?.token, setMicrosoftConnected, setGoogleConnected]);

  useEffect(() => {
    if (!session?.token) return;
    fetchUsageToday(session.token).then((data) => {
      if (data) setUsage(data);
    });
    fetchMemories(session.token).then(setMemories);
  }, [session?.token]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-sm font-semibold text-foreground">Settings</h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto flex max-w-xl flex-col gap-3">
          {/* Profile Section */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="text-[13px] font-semibold text-foreground">
              Profile
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Your account information
            </p>

            <div className="mt-4 flex items-center gap-4">
              {user?.image ? (
                <img
                  src={user.image}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                  {user?.name
                    ? user.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)
                    : user?.email?.charAt(0).toUpperCase() ?? "?"}
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {user?.name || "User"}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {user?.email}
                </span>
              </div>
            </div>
          </div>

          {/* Integrations pointer */}
          {googleError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[12px] text-red-600 dark:text-red-400">
              <span className="font-semibold">Google connect failed:</span>{" "}
              {decodeURIComponent(googleError)}
            </div>
          )}
          <Link
            href="/hub"
            className="group flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/30 hover:bg-accent/5"
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-[13px] font-semibold text-foreground">
                Integrations
              </h2>
              <p className="text-[12px] text-muted-foreground">
                {connectedCount === 0
                  ? "Connect a service to get started in the Hub"
                  : `${connectedCount} integration${connectedCount === 1 ? "" : "s"} connected · manage in Hub`}
              </p>
            </div>
            <span className="flex items-center gap-1 text-[12px] font-medium text-accent transition-transform group-hover:translate-x-0.5">
              Open Hub
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                />
              </svg>
            </span>
          </Link>

          {/* Preferences Section */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="text-[13px] font-semibold text-foreground">
              Preferences
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Customize how Orbit works for you
            </p>

            <div className="mt-4 flex flex-col gap-3">
              <TimezoneRow />
              <ThemeRow />
            </div>
          </div>

          {/* Memories Section */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="text-[13px] font-semibold text-foreground">
              What Orbit remembers
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Preferences and facts Orbit has learned about you over time
            </p>
            <div className="mt-4">
              {memories.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-surface-raised px-4 py-6 text-center">
                  <p className="text-[12px] text-muted-foreground">
                    Nothing remembered yet. Tell Orbit about your preferences
                    (e.g. &quot;I prefer morning meetings&quot;) and they&apos;ll
                    show up here.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {memories.map((m) => (
                    <li
                      key={m.id}
                      className="group flex flex-col gap-1 rounded-lg border border-border bg-surface-raised px-4 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-[13px] leading-relaxed text-foreground">
                          {m.memory}
                        </span>
                        <button
                          onClick={async () => {
                            if (!session?.token) return;
                            if (!confirm("Forget this memory?")) return;
                            const ok = await deleteMemory(m.id, session.token);
                            if (ok)
                              setMemories((prev) =>
                                prev.filter((x) => x.id !== m.id),
                              );
                          }}
                          className="shrink-0 cursor-pointer rounded-md p-1 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                          title="Forget this memory"
                          aria-label="Forget this memory"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.75}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                      {m.topics.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {m.topics.map((t) => (
                            <span
                              key={t}
                              className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Usage Section */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="text-[13px] font-semibold text-foreground">
              Usage today
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              What Orbit has done for you since midnight UTC
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <UsageStat
                label="Messages"
                value={usage ? usage.messages.toLocaleString() : "—"}
              />
              <UsageStat
                label="Input tokens"
                value={usage ? usage.input_tokens.toLocaleString() : "—"}
              />
              <UsageStat
                label="Output tokens"
                value={usage ? usage.output_tokens.toLocaleString() : "—"}
              />
              <UsageStat
                label="Est. cost"
                value={
                  usage ? `$${usage.estimated_cost_usd.toFixed(4)}` : "—"
                }
                accent
              />
            </div>

            {usage && usage.daily_cap_usd > 0 && (
              <DailyCapBar
                spent={usage.estimated_cost_usd}
                cap={usage.daily_cap_usd}
              />
            )}
          </div>

          {/* About Section */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="text-[13px] font-semibold text-foreground">About</h2>
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">
                  Version
                </span>
                <span className="text-[12px] font-mono text-muted-foreground">
                  0.1.0
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">
                  Source
                </span>
                <a
                  href="https://github.com/FelipeSanch/Orbit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-accent transition-colors hover:underline"
                >
                  GitHub ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeRow() {
  const { theme, setTheme } = useTheme();
  const options: { value: ThemePreference; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface-raised px-4 py-3">
      <div>
        <span className="text-[13px] font-medium text-foreground">Theme</span>
        <p className="text-[11px] text-muted-foreground">
          Light, dark, or follow your system
        </p>
      </div>
      <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setTheme(o.value)}
            className={`cursor-pointer rounded px-2 py-1 text-[11px] font-medium transition-colors ${
              theme === o.value
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={theme === o.value}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TimezoneRow() {
  // Backed by user_preferences.timezone in Postgres. The browser-
  // detected value is the initial default until the server's stored
  // value loads (typically a single round-trip on mount).
  const session = useAuthStore((s) => s.session);
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [tz, setTz] = useState<string>(detected);
  useEffect(() => {
    if (!session?.token) return;
    fetchPreferences(session.token).then((p) => {
      if (p?.timezone) setTz(p.timezone);
    });
  }, [session?.token]);
  const updateTz = (next: string) => {
    setTz(next);
    if (!session?.token) return;
    updatePreferences(session.token, { timezone: next });
  };
  // Curated list — covers the broad strokes without the 400-entry IANA
  // dump. "Browser detected" always present so the user can return to
  // the auto default without remembering their zone.
  const choices = Array.from(
    new Set([
      detected,
      "America/Los_Angeles",
      "America/Denver",
      "America/Chicago",
      "America/New_York",
      "America/Sao_Paulo",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Europe/Madrid",
      "Asia/Dubai",
      "Asia/Kolkata",
      "Asia/Singapore",
      "Asia/Tokyo",
      "Australia/Sydney",
      "UTC",
    ]),
  );
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface-raised px-4 py-3">
      <div>
        <span className="text-[13px] font-medium text-foreground">
          Timezone
        </span>
        <p className="text-[11px] text-muted-foreground">
          Used for calendar and task scheduling
        </p>
      </div>
      <select
        value={tz}
        onChange={(e) => updateTz(e.target.value)}
        className="cursor-pointer rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] text-foreground transition-colors hover:border-muted-foreground/30 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        aria-label="Timezone"
      >
        {choices.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}

function UsageStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-raised px-3 py-2.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <span
        className={`text-[15px] font-semibold tabular-nums ${
          accent ? "text-accent" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function DailyCapBar({ spent, cap }: { spent: number; cap: number }) {
  // Pct over the cap clamps to 100 so the bar doesn't overflow visually.
  // The numeric line still shows the real spent value so a user a hair
  // over the cap can see exactly where they are.
  const pct = Math.min(100, Math.round((spent / cap) * 100));
  const atOrOver = spent >= cap;
  const warn = pct >= 80 && !atOrOver;

  const barClass = atOrOver
    ? "bg-red-500"
    : warn
      ? "bg-amber-500"
      : "bg-accent";
  const textClass = atOrOver
    ? "text-red-500"
    : warn
      ? "text-amber-500"
      : "text-muted-foreground";

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface-raised px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Daily cap
        </span>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          <span className={`font-semibold ${textClass}`}>
            ${spent.toFixed(4)}
          </span>
          <span className="text-muted-foreground/60"> / ${cap.toFixed(2)}</span>
        </span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Daily spend cap usage"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`mt-1.5 text-[11px] ${textClass}`}>
        {atOrOver
          ? "You've hit today's cap — new requests will be blocked until 00:00 UTC."
          : warn
            ? `Close to the cap (${pct}%). Heavy use may pause until 00:00 UTC.`
            : "Resets at 00:00 UTC."}
      </p>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

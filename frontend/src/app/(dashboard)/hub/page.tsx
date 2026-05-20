"use client";

import { useState } from "react";
import { CosmicFrame } from "@/components/hub/cosmic-frame";
import {
  ConnectModal,
  type ConnectModalState,
} from "@/components/hub/connect-modal";
import {
  GithubIcon,
  GmailIcon,
  GoogleCalendarIcon,
  MicrosoftIcon,
  NotionIcon,
  SlackIcon,
  TwilioIcon,
} from "@/components/hub/integration-icons";
import {
  IntegrationCard,
  type CardStatus,
  type SubItem,
} from "@/components/hub/integration-card";
import { useAuthStore } from "@/stores/auth-store";
import { env } from "@/lib/env";
import { getGoogleAuthUrl, getMicrosoftAuthUrl } from "@/lib/api";

interface IntegrationDef {
  id: string;
  name: string;
  category: string;
  description: string;
  subItems: SubItem[];
  icon: React.ReactNode;
  iconBg: string;
  scopes: string[];
}

const ICON_INBOX =
  "M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z";
const ICON_CALENDAR =
  "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5";
const ICON_CHECK =
  "M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z";
const ICON_CHAT =
  "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z";
const ICON_PHONE =
  "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z";
const ICON_FILE =
  "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z";
const ICON_HASH =
  "M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5";
const ICON_BRANCH =
  "M6 3v12m0 0a3 3 0 103 3M6 15a3 3 0 113-3M18 9a3 3 0 11-6 0 3 3 0 016 0zM18 9v6a3 3 0 01-3 3h-3";

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: "microsoft",
    name: "Microsoft 365",
    category: "Email · Calendar · Tasks",
    description: "Outlook Mail, Calendar, and Microsoft To Do.",
    subItems: [
      { label: "Outlook Mail", iconPath: ICON_INBOX },
      { label: "Outlook Calendar", iconPath: ICON_CALENDAR },
      { label: "Microsoft To Do", iconPath: ICON_CHECK },
    ],
    icon: <MicrosoftIcon size={20} />,
    iconBg: "rgba(255, 255, 255, 0.95)",
    scopes: [
      "Read and search your inbox",
      "Send, reply, and organize emails (with approval)",
      "Read and create calendar events",
      "Read and create Microsoft To Do tasks",
    ],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "Calendar",
    description: "Route calendar work to your Google account.",
    subItems: [
      { label: "Primary calendar", iconPath: ICON_CALENDAR },
      { label: "Read events", iconPath: ICON_CHECK },
      { label: "Create / update / delete (with approval)", iconPath: ICON_CHECK },
    ],
    icon: <GoogleCalendarIcon size={20} />,
    iconBg: "rgba(255, 255, 255, 0.95)",
    scopes: [
      "Read events on your Google Calendar",
      "Create, update, delete events (with approval)",
      "Used in place of Outlook calendar when connected",
    ],
  },
  {
    id: "twilio",
    name: "Twilio (SMS)",
    category: "Messaging",
    description: "Text Orbit from your phone — briefings, replies, approvals over SMS.",
    subItems: [
      { label: "Inbound SMS", iconPath: ICON_PHONE },
      { label: "Daily briefings as text", iconPath: ICON_CHAT },
    ],
    icon: <TwilioIcon size={20} />,
    iconBg: "rgba(242, 47, 70, 0.12)",
    scopes: ["Receive SMS, reply via Orbit", "Daily briefings over text"],
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "Email",
    description: "Read and send Gmail without leaving Orbit.",
    subItems: [
      { label: "Inbox", iconPath: ICON_INBOX },
      { label: "Compose & send (with approval)", iconPath: ICON_CHECK },
    ],
    icon: <GmailIcon size={20} />,
    iconBg: "rgba(255, 255, 255, 0.95)",
    scopes: ["Read inbox", "Compose and send (with approval)"],
  },
  {
    id: "notion",
    name: "Notion",
    category: "Notes",
    description: "Capture meeting notes and append to a daily journal.",
    subItems: [
      { label: "Pages & databases", iconPath: ICON_FILE },
      { label: "Daily journal", iconPath: ICON_FILE },
    ],
    icon: <NotionIcon size={20} />,
    iconBg: "rgba(255, 255, 255, 0.95)",
    scopes: ["Read and create pages", "Append to a daily journal"],
  },
  {
    id: "slack",
    name: "Slack",
    category: "Messaging",
    description: "Channel summaries while you're heads-down. Post with approval.",
    subItems: [
      { label: "Channels you're in", iconPath: ICON_HASH },
      { label: "Post messages (with approval)", iconPath: ICON_CHAT },
    ],
    icon: <SlackIcon size={20} />,
    iconBg: "rgba(74, 21, 75, 0.15)",
    scopes: ["Read channels you're in", "Send messages (with approval)"],
  },
  {
    id: "github",
    name: "GitHub",
    category: "Code",
    description: "PRs that need review, issues you're tagged on — at a glance.",
    subItems: [
      { label: "Pull requests", iconPath: ICON_BRANCH },
      { label: "Issues you're tagged in", iconPath: ICON_BRANCH },
    ],
    icon: <GithubIcon size={20} className="text-foreground" />,
    iconBg: "rgba(255, 255, 255, 0.06)",
    scopes: ["Read PRs and issues you're tagged in"],
  },
];

const COMING_SOON = new Set(["twilio", "gmail", "notion", "slack", "github"]);

export default function HubPage() {
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const isMicrosoftConnected = useAuthStore((s) => s.isMicrosoftConnected);
  const setMicrosoftConnected = useAuthStore((s) => s.setMicrosoftConnected);
  const isGoogleConnected = useAuthStore((s) => s.isGoogleConnected);
  const setGoogleConnected = useAuthStore((s) => s.setGoogleConnected);

  const [modal, setModal] = useState<ConnectModalState | null>(null);
  const [pending, setPending] = useState(false);
  const [filter, setFilter] = useState<"all" | "connected" | "available">("all");
  const [zoom, setZoom] = useState(1);

  const ZOOM_MIN = 0.6;
  const ZOOM_MAX = 1.4;
  const ZOOM_STEP = 0.1;
  const zoomIn = () =>
    setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100));
  const zoomOut = () =>
    setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100));
  const zoomReset = () => setZoom(1);

  const statusFor = (id: string): CardStatus => {
    if (id === "microsoft")
      return isMicrosoftConnected ? "connected" : "available";
    if (id === "google-calendar")
      return isGoogleConnected ? "connected" : "available";
    return COMING_SOON.has(id) ? "soon" : "available";
  };

  const connectedCount = INTEGRATIONS.filter(
    (i) => statusFor(i.id) === "connected",
  ).length;

  const filtered = INTEGRATIONS.filter((i) => {
    const s = statusFor(i.id);
    if (filter === "connected") return s === "connected";
    if (filter === "available") return s !== "soon";
    return true;
  });

  const sections: { label: string; items: IntegrationDef[] }[] = [
    {
      label: "Connected",
      items: filtered.filter((i) => statusFor(i.id) === "connected"),
    },
    {
      label: "Available",
      items: filtered.filter((i) => statusFor(i.id) === "available"),
    },
    {
      label: "Coming soon",
      items: filtered.filter((i) => statusFor(i.id) === "soon"),
    },
  ].filter((s) => s.items.length > 0);

  const openCard = (def: IntegrationDef) => {
    const status = statusFor(def.id);
    if (status === "soon") {
      setModal({
        name: def.name,
        description: `${def.description} Coming in a future Orbit release.`,
        icon: def.icon,
        isConnected: false,
        scopes: def.scopes,
      });
      return;
    }

    const isConnected =
      def.id === "microsoft" ? isMicrosoftConnected : isGoogleConnected;

    setModal({
      name: def.name,
      description: def.description,
      icon: def.icon,
      isConnected,
      scopes: def.scopes,
      onConnect: async () => {
        if (!session?.token) return;
        const result =
          def.id === "microsoft"
            ? await getMicrosoftAuthUrl(session.token)
            : await getGoogleAuthUrl(session.token);
        if (result.ok) {
          window.location.href = result.url;
          return;
        }
        // Surface the failure inline so Connect isn't a silent no-op.
        const message =
          result.reason === "unauthorized"
            ? "Your session expired. Please sign in again."
            : result.reason === "network"
              ? "Couldn't reach Orbit's backend. Check your connection and retry."
              : result.reason === "malformed"
                ? "Got an unexpected response from the server. Try again."
                : `Couldn't start connection (HTTP ${result.status ?? "error"}). Try again.`;
        setModal((prev) => (prev ? { ...prev, error: message } : prev));
      },
      onDisconnect: async () => {
        if (!session?.token) return;
        setPending(true);
        try {
          const path =
            def.id === "microsoft" ? "/api/auth/microsoft" : "/api/auth/google";
          await fetch(`${env.apiUrl}${path}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${session.token}` },
          });
          if (def.id === "microsoft") setMicrosoftConnected(false);
          else setGoogleConnected(false);
          setModal(null);
        } finally {
          setPending(false);
        }
      },
      isPending: pending,
    });
  };

  const workspaceName = user?.name?.split(" ")[0]?.toLowerCase() ?? "your";

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      {/* Painterly cosmic frame */}
      <CosmicFrame />

      {/* Workspace chrome bar */}
      <div className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/40 px-6 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-[13px]">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-accent">
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 21a9 9 0 100-18 9 9 0 000 18z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"
              />
            </svg>
          </div>
          <span className="text-muted-foreground">{workspaceName}</span>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-medium text-foreground">hub</span>
        </div>

        <div className="flex items-center gap-1 text-[12px]">
          <button
            onClick={() => setFilter("all")}
            className={`cursor-pointer rounded-md px-3 py-1.5 transition-colors ${
              filter === "all"
                ? "border-b-2 border-accent text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("connected")}
            className={`cursor-pointer rounded-md px-3 py-1.5 transition-colors ${
              filter === "connected"
                ? "border-b-2 border-accent text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Connected
            <span className="ml-1.5 rounded bg-emerald-500/10 px-1 text-[10px] font-medium text-emerald-500">
              {connectedCount}
            </span>
          </button>
          <button
            onClick={() => setFilter("available")}
            className={`cursor-pointer rounded-md px-3 py-1.5 transition-colors ${
              filter === "available"
                ? "border-b-2 border-accent text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Available
          </button>
        </div>

        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-muted-foreground">
            {connectedCount} of {INTEGRATIONS.length}
          </span>
          <div className="h-4 w-px bg-border" />
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-[10px] font-semibold text-accent">
            {(user?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div
          className="relative mx-auto max-w-6xl px-6 py-5"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top center",
            transition: "transform 150ms ease-out",
          }}
        >
          {sections.map(({ label, items }) => (
            <section key={label} className="mb-5 last:mb-0">
              <div className="mb-2.5 flex items-baseline gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {label}
                </h2>
                <span className="text-[10px] text-muted-foreground/50">
                  {items.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((def) => (
                  <IntegrationCard
                    key={def.id}
                    name={def.name}
                    category={def.category}
                    description={def.description}
                    icon={def.icon}
                    iconBg={def.iconBg}
                    status={statusFor(def.id)}
                    subItems={def.subItems}
                    onClick={() => openCard(def)}
                  />
                ))}
              </div>
            </section>
          ))}

          {sections.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
              <p className="text-[13px] text-muted-foreground">
                Nothing matches this filter.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Zoom controls — bottom-left */}
      <div className="absolute bottom-4 left-4 z-20 hidden flex-col items-center gap-0.5 rounded-md border border-border/60 bg-surface/80 p-1 backdrop-blur-sm md:flex">
        <button
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX}
          className="cursor-pointer rounded p-1 text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/80"
          aria-label="Zoom in"
          title="Zoom in"
        >
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
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
        </button>
        <button
          onClick={zoomReset}
          disabled={zoom === 1}
          className="cursor-pointer rounded px-1 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/80"
          aria-label="Reset zoom"
          title="Reset zoom (100%)"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN}
          className="cursor-pointer rounded p-1 text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/80"
          aria-label="Zoom out"
          title="Zoom out"
        >
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
              d="M19.5 12h-15"
            />
          </svg>
        </button>
      </div>

      <ConnectModal state={modal} onClose={() => setModal(null)} />
    </div>
  );
}

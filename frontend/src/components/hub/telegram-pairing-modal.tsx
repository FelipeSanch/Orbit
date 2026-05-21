"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TelegramIcon } from "@/components/hub/integration-icons";
import {
  disconnectTelegram,
  fetchTelegramStatus,
  pairTelegram,
  type TelegramPairing,
} from "@/lib/api";

interface TelegramPairingModalProps {
  open: boolean;
  token: string | null;
  initialConnected: boolean;
  initialChatId?: string;
  onClose: () => void;
  onConnectedChange: (connected: boolean, chatId?: string) => void;
}

// Polling cadence while the user is meant to be tapping the deeplink.
// 2s is responsive without hammering the backend; we stop after 10 min
// (the lifetime of the pairing code).
const POLL_INTERVAL_MS = 2000;
const POLL_DURATION_MS = 10 * 60 * 1000;

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "code"; pairing: TelegramPairing }
  | { kind: "connected"; chatId?: string }
  | { kind: "error"; message: string };

export function TelegramPairingModal({
  open,
  token,
  initialConnected,
  initialChatId,
  onClose,
  onConnectedChange,
}: TelegramPairingModalProps) {
  const [phase, setPhase] = useState<Phase>(() =>
    initialConnected
      ? { kind: "connected", chatId: initialChatId }
      : { kind: "idle" },
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadline = useRef<number>(0);

  // Reset to the right initial phase whenever the modal re-opens.
  useEffect(() => {
    if (!open) return;
    setPhase(
      initialConnected
        ? { kind: "connected", chatId: initialChatId }
        : { kind: "idle" },
    );
    setCopied(false);
  }, [open, initialConnected, initialChatId]);

  const stopPolling = useCallback(() => {
    if (pollHandle.current) {
      clearInterval(pollHandle.current);
      pollHandle.current = null;
    }
  }, []);

  // Cleanup on unmount.
  useEffect(() => stopPolling, [stopPolling]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stopPolling();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, stopPolling]);

  const beginPolling = useCallback(() => {
    if (!token) return;
    stopPolling();
    pollDeadline.current = Date.now() + POLL_DURATION_MS;
    pollHandle.current = setInterval(async () => {
      if (Date.now() > pollDeadline.current) {
        stopPolling();
        return;
      }
      const status = await fetchTelegramStatus(token);
      if (status?.connected) {
        stopPolling();
        setPhase({ kind: "connected", chatId: status.chat_id });
        onConnectedChange(true, status.chat_id);
      }
    }, POLL_INTERVAL_MS);
  }, [token, stopPolling, onConnectedChange]);

  const handleGenerate = useCallback(async () => {
    if (!token) return;
    setPhase({ kind: "loading" });
    const result = await pairTelegram(token);
    if (!result.ok) {
      const message =
        result.reason === "unconfigured"
          ? (result.message ??
            "Telegram bot isn't configured on the backend yet.")
          : result.reason === "unauthorized"
            ? "Your session expired. Please sign in again."
            : result.reason === "network"
              ? "Couldn't reach Orbit's backend. Try again."
              : `Couldn't generate a code (HTTP ${result.status ?? "error"}).`;
      setPhase({ kind: "error", message });
      return;
    }
    setPhase({ kind: "code", pairing: result.pairing });
    beginPolling();
  }, [token, beginPolling]);

  const handleDisconnect = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      const ok = await disconnectTelegram(token);
      if (ok) {
        onConnectedChange(false);
        setPhase({ kind: "idle" });
      }
    } finally {
      setBusy(false);
    }
  }, [token, onConnectedChange]);

  const handleCopy = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable on http:// in some browsers — silently
      // no-op so the modal stays usable; the code is on-screen either way.
    }
  }, []);

  const handleClose = useCallback(() => {
    stopPolling();
    onClose();
  }, [stopPolling, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(34,158,217,0.12)]">
            <TelegramIcon size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Telegram</h2>
            <div className="mt-0.5 flex items-center gap-1.5 text-[12px]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  phase.kind === "connected"
                    ? "bg-emerald-400"
                    : "bg-zinc-400 dark:bg-zinc-600"
                }`}
              />
              <span className="text-muted-foreground">
                {phase.kind === "connected" ? "Connected" : "Not connected"}
              </span>
            </div>
          </div>
        </div>

        {phase.kind === "idle" && (
          <>
            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
              Chat with Orbit from Telegram — free text, inline approval
              buttons on every write action, and the same agent that powers
              the web app.
            </p>
            <ol className="mt-4 space-y-2 text-[12px] text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">1.</span>{" "}
                Generate a one-time pairing code below.
              </li>
              <li>
                <span className="font-medium text-foreground">2.</span>{" "}
                Open the bot in Telegram and tap{" "}
                <span className="rounded bg-muted px-1 font-mono text-[11px]">
                  Start
                </span>
                .
              </li>
              <li>
                <span className="font-medium text-foreground">3.</span>{" "}
                Done — this dialog flips to Connected automatically.
              </li>
            </ol>
            <div className="mt-5 flex gap-2">
              <Button variant="primary" size="sm" onClick={handleGenerate}>
                Generate pairing code
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Close
              </Button>
            </div>
          </>
        )}

        {phase.kind === "loading" && (
          <p className="mt-6 text-center text-[13px] text-muted-foreground">
            Generating code…
          </p>
        )}

        {phase.kind === "code" && (
          <>
            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
              Open the bot in Telegram and tap Start — the code below is
              attached automatically. Or send{" "}
              <span className="rounded bg-muted px-1 font-mono text-[11px]">
                /start {phase.pairing.code}
              </span>{" "}
              manually.
            </p>
            <div className="mt-4 rounded-lg border border-border bg-surface-raised p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Pairing code
                </span>
                <button
                  onClick={() => handleCopy(phase.pairing.code)}
                  className="cursor-pointer text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-[0.3em] text-foreground">
                {phase.pairing.code}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground/70">
                Expires in 10 minutes · single-use
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <a
                href={phase.pairing.deeplink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground shadow-sm shadow-accent/25 transition-all duration-150 hover:brightness-110 active:brightness-95"
              >
                Open @{phase.pairing.bot_username}
              </a>
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Close
              </Button>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground/70">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              Waiting for you to tap Start in Telegram…
            </div>
          </>
        )}

        {phase.kind === "connected" && (
          <>
            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
              Telegram is linked to your Orbit account. Messages you send
              the bot will be answered by the same agent that runs in the
              web app, and write actions will show up here as inline
              Approve / Reject buttons.
            </p>
            {phase.chatId && (
              <div className="mt-4 rounded-lg border border-border bg-surface-raised p-3 text-[12px] text-muted-foreground">
                Chat ID:{" "}
                <span className="font-mono text-foreground">{phase.chatId}</span>
              </div>
            )}
            <div className="mt-5 flex gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={handleDisconnect}
                disabled={busy}
              >
                Disconnect
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Close
              </Button>
            </div>
          </>
        )}

        {phase.kind === "error" && (
          <>
            <p
              role="alert"
              className="mt-4 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-[13px] text-red-600 dark:text-red-400"
            >
              {phase.message}
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="primary" size="sm" onClick={handleGenerate}>
                Try again
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface ConnectModalState {
  name: string;
  description: string;
  icon: ReactNode;
  isConnected: boolean;
  scopes: string[];
  onConnect?: () => void;
  onDisconnect?: () => Promise<void> | void;
  isPending?: boolean;
  /**
   * If set, rendered below the action buttons. Lets the caller surface an
   * OAuth-init failure (network, 401, malformed response) inline instead
   * of the Connect button silently no-op'ing.
   */
  error?: string;
}

interface ConnectModalProps {
  state: ConnectModalState | null;
  onClose: () => void;
}

export function ConnectModal({ state, onClose }: ConnectModalProps) {
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onClose]);

  if (!state) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
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
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-raised">
            {state.icon}
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {state.name}
            </h2>
            <div className="mt-0.5 flex items-center gap-1.5 text-[12px]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  state.isConnected
                    ? "bg-emerald-400"
                    : "bg-zinc-400 dark:bg-zinc-600"
                }`}
              />
              <span className="text-muted-foreground">
                {state.isConnected ? "Connected" : "Not connected"}
              </span>
            </div>
          </div>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          {state.description}
        </p>

        {state.scopes.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-surface-raised p-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              What Orbit can do
            </span>
            <ul className="mt-2 flex flex-col gap-1.5">
              {state.scopes.map((s) => (
                <li
                  key={s}
                  className="flex items-start gap-2 text-[12px] text-foreground"
                >
                  <svg
                    className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          {state.isConnected ? (
            <Button
              variant="danger"
              size="sm"
              onClick={state.onDisconnect}
              disabled={state.isPending}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={state.onConnect}
              disabled={state.isPending}
            >
              Connect
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {state.error && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-[12px] text-red-600 dark:text-red-400"
          >
            {state.error}
          </p>
        )}
      </div>
    </div>
  );
}

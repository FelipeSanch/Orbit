"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { MessageBubble } from "./message-bubble";
import { OrbitLogo } from "@/components/ui/orbit-logo";
import { Markdown } from "@/components/ui/markdown";
import type { Message } from "@/types/events";

const SUGGESTIONS = [
  {
    icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
    label: "What should I focus on today?",
    description: "A quick briefing across inbox, calendar, and tasks",
  },
  {
    icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75",
    label: "Anything urgent in my inbox?",
    description: "Triage what actually needs a reply",
  },
  {
    icon: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
    label: "What does my day look like?",
    description: "Today's meetings at a glance",
  },
  {
    icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    label: "What's on my task list?",
    description: "Pending to-dos, most urgent first",
  },
];

interface MessageListProps {
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  onSuggestionClick?: (text: string) => void;
  // True when the user has no data sources connected (no Microsoft, no
  // Google). Drives an empty-state nudge toward the Hub instead of
  // showing suggestion chips that would dead-end on an error.
  noIntegrationsConnected?: boolean;
}

export function MessageList({
  messages,
  streamingContent,
  isStreaming,
  onSuggestionClick,
  noIntegrationsConnected = false,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {messages.length === 0 && !isStreaming ? (
        /* Empty state with suggestions */
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-accent/10 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 ring-1 ring-accent/10">
                <OrbitLogo size={32} />
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">
                {noIntegrationsConnected
                  ? "Connect a service to get started"
                  : "What can I take off your plate?"}
              </h2>
              <p className="max-w-sm text-center text-sm text-muted-foreground">
                {noIntegrationsConnected
                  ? "I'll need access to your email or calendar before I can help. Pick what you use most in the Hub — it takes about 30 seconds."
                  : "I can read your inbox, manage your calendar, and keep your tasks in shape. Ask me anything — or try one of these."}
              </p>
            </div>

            {noIntegrationsConnected ? (
              <Link
                href="/hub"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-sm shadow-accent/25 transition-all duration-150 hover:brightness-110 active:brightness-95"
              >
                Open the Hub
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3"
                  />
                </svg>
              </Link>
            ) : (
              <div className="grid w-full max-w-lg grid-cols-1 gap-2.5 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => onSuggestionClick?.(s.label)}
                    className="group flex cursor-pointer flex-col gap-1.5 rounded-xl border border-border bg-surface p-3.5 text-left transition-all duration-150 hover:border-accent/30 hover:bg-accent/5 active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-2">
                      <svg
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d={s.icon}
                        />
                      </svg>
                      <span className="text-[13px] font-medium text-foreground">
                        {s.label}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {s.description}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Message list */
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {isStreaming && streamingContent && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10">
                <OrbitLogo size={18} />
              </div>
              <div className="flex-1 rounded-2xl rounded-tl-md bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">
                <Markdown content={streamingContent} />
                <span className="ml-0.5 inline-block h-4 w-[2px] animate-blink bg-accent" />
              </div>
            </div>
          )}

          {isStreaming && !streamingContent && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10">
                <OrbitLogo size={18} />
              </div>
              <div className="rounded-2xl rounded-tl-md bg-muted px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60 [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60 [animation-delay:300ms]" />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Thinking...
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

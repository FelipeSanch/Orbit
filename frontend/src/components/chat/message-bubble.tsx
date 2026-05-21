"use client";

import type { Message } from "@/types/events";
import { OrbitLogo } from "@/components/ui/orbit-logo";
import { Markdown } from "@/components/ui/markdown";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isError = message.kind === "error";

  // Avatar container styling — error messages get a soft red wash so the
  // visual hierarchy makes "this is not a normal Orbit reply" obvious
  // before the user reads the text.
  const avatarBg = isUser
    ? "bg-accent text-accent-foreground"
    : isError
      ? "bg-red-500/10 text-red-500"
      : "bg-accent/10";

  const bubbleClasses = isUser
    ? "rounded-tr-md bg-accent text-accent-foreground"
    : isError
      ? "rounded-tl-md border border-red-500/30 bg-red-500/5 text-foreground"
      : "rounded-tl-md bg-muted text-foreground";

  const senderLabel = isUser ? "You" : isError ? "Issue" : "Orbit";
  const senderClasses = isError
    ? "px-1 text-[11px] font-medium text-red-500"
    : "px-1 text-[11px] font-medium text-muted-foreground";

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
      role={isError ? "alert" : undefined}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${avatarBg}`}
      >
        {isUser ? (
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
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            />
          </svg>
        ) : isError ? (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.732 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        ) : (
          <OrbitLogo size={18} />
        )}
      </div>
      <div className={`flex max-w-[75%] flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
        <span className={senderClasses}>{senderLabel}</span>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${bubbleClasses}`}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <Markdown content={message.content} />
          )}
        </div>
        <span className="px-1 text-[10px] text-muted-foreground/60">
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

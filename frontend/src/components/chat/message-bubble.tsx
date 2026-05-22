"use client";

import type { Message } from "@/types/events";
import { OrbitLogo } from "@/components/ui/orbit-logo";
import { Markdown } from "@/components/ui/markdown";
import { StructuredCards } from "./structured-cards";

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

  // Larger, softer corners — Felipe asked for less square / more
  // inviting. User bubbles drop the avatar entirely (right-align +
  // accent fill already says "you") and skip the "You" label.
  const bubbleClasses = isUser
    ? "rounded-3xl rounded-tr-lg bg-accent text-accent-foreground"
    : isError
      ? "rounded-3xl rounded-tl-lg border border-red-500/30 bg-red-500/5 text-foreground"
      : "rounded-3xl rounded-tl-lg bg-muted text-foreground";

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
      role={isError ? "alert" : undefined}
    >
      {!isUser && (
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${avatarBg}`}
        >
          {isError ? (
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
      )}
      <div
        className={`flex max-w-[75%] flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
      >
        <div
          className={`px-4 py-3 text-sm leading-relaxed ${bubbleClasses}`}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <Markdown content={message.content} />
          )}
        </div>
        {/* Structured cards (emails / events / tasks) rendered below
            the prose when the turn ended on a list-style tool. */}
        {!isUser && message.structuredData && (
          <div className="w-full max-w-[75%]">
            <StructuredCards data={message.structuredData} />
          </div>
        )}
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

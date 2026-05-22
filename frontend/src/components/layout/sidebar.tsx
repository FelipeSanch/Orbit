"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  deleteConversation,
  fetchConversation,
  fetchConversations,
  renameConversation,
} from "@/lib/api";
import { useActivityStore } from "@/stores/activity-store";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { OrbitLogo } from "@/components/ui/orbit-logo";

const navItems = [
  {
    href: "/hub",
    label: "Hub",
    icon: "M12 21a9 9 0 100-18 9 9 0 000 18zm0 0v-9m0 0a3 3 0 100-6 3 3 0 000 6z",
  },
  {
    href: "/chat",
    label: "Chat",
    icon: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.2 48.2 0 005.068-.506c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
  },
  {
    href: "/activity",
    label: "Activity",
    icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const isMicrosoftConnected = useAuthStore((s) => s.isMicrosoftConnected);
  const isGoogleConnected = useAuthStore((s) => s.isGoogleConnected);
  const conversations = useChatStore((s) => s.conversations);
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const setConversations = useChatStore((s) => s.setConversations);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const setConversationId = useChatStore((s) => s.setConversationId);
  const removeConversation = useChatStore((s) => s.removeConversation);
  const renameConversationLocal = useChatStore(
    (s) => s.renameConversationLocal,
  );
  const reset = useChatStore((s) => s.reset);
  const isStreaming = useChatStore((s) => s.isStreaming);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const menuWrapRef = useRef<HTMLDivElement | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    const onDoc = (e: MouseEvent) => {
      if (
        menuWrapRef.current &&
        !menuWrapRef.current.contains(e.target as Node)
      ) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openMenuId]);

  // Fetch conversations on mount and when streaming finishes (new conv may have been created)
  useEffect(() => {
    if (!session?.token) return;
    fetchConversations(session.token).then((convs) => {
      setConversations(
        convs.map((c) => ({
          id: c.id,
          title: c.title,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        })),
      );
    });
  }, [session?.token, setConversations, isStreaming]);

  const handleSignOut = async () => {
    // Server-side: Better Auth invalidates the session row and sends
    // Set-Cookie to clear both `better-auth.session_token` and the
    // `__Secure-` prefixed variant. Wrap in try/catch so a failed
    // server call (offline, 5xx) still nukes the client state.
    try {
      await authClient.signOut();
    } catch {
      // ignore — we'll force-clear the client anyway
    }
    // Client-side: wipe every per-user store so a different account
    // signing in from the same tab doesn't see leaked state.
    useAuthStore.getState().clear();
    useChatStore.getState().reset();
    useActivityStore.getState().clearActivities();
    // Full document navigation (not router.push). router.push is a
    // client-side transition that bypasses middleware; the next page
    // would render with whatever auth state was already in memory.
    // window.location forces a real HTTP request — middleware re-runs
    // with the freshly-cleared cookies. Landing (vs /login) matches the
    // convention most apps use: signed-out users get the public marketing
    // page, then opt back in via the Log in button.
    window.location.href = "/";
  };

  const handleNewChat = () => {
    reset();
    useActivityStore.getState().clearActivities();
    router.push("/chat");
  };

  const handleDeleteConversation = async (id: string) => {
    setOpenMenuId(null);
    if (!session?.token) return;
    if (!confirm("Delete this conversation? This can't be undone.")) return;
    const ok = await deleteConversation(id, session.token);
    if (ok) {
      removeConversation(id);
      if (id === currentConversationId) router.push("/chat");
    }
  };

  const startRename = (id: string, currentTitle: string | null) => {
    setOpenMenuId(null);
    setRenamingId(id);
    setRenameValue(currentTitle ?? "");
  };

  const commitRename = async () => {
    const id = renamingId;
    const value = renameValue.trim();
    setRenamingId(null);
    if (!id || !value || !session?.token) return;
    renameConversationLocal(id, value);
    await renameConversation(id, value, session.token);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const handleSelectConversation = async (id: string) => {
    if (id === currentConversationId) return;
    if (!session?.token) return;

    selectConversation(id);
    useActivityStore.getState().clearActivities();
    router.push("/chat");

    const data = await fetchConversation(id, session.token);
    if (data?.messages) {
      loadMessages(
        data.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
          createdAt: m.created_at,
        })),
      );
      setConversationId(id);
    }
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.charAt(0).toUpperCase() ?? "?";

  return (
    <aside className="flex h-full w-16 flex-col bg-surface lg:w-64">
      {/* Logo (links to landing page) + New Chat */}
      <div className="flex flex-col gap-3 p-3 pb-2">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors hover:bg-muted"
          title="Back to home"
        >
          <OrbitLogo size={26} />
          <span className="hidden text-[15px] font-semibold tracking-tight text-foreground lg:block">
            Orbit
          </span>
        </Link>

        <button
          onClick={handleNewChat}
          className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised text-sm font-medium text-foreground transition-all duration-150 hover:bg-muted hover:border-muted-foreground/20 active:scale-[0.98] lg:justify-start lg:px-3"
        >
          <svg
            className="h-4 w-4 shrink-0"
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
          <span className="hidden lg:block">New Chat</span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 px-3 pb-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href === "/chat" && pathname === "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-all duration-150 ${
                isActive
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <svg
                className="h-[16px] w-[16px] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={item.icon}
                />
              </svg>
              <span className="hidden lg:block">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Conversation History */}
      <div className="mx-3 border-t border-border" />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="hidden px-5 pt-3 pb-1.5 lg:block">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Recent
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-1">
          {conversations.length === 0 ? (
            <div className="hidden px-2 py-6 lg:block">
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground/50">
                Your conversations will appear here
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {conversations.map((conv) => {
                const isActive = currentConversationId === conv.id;
                return (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`group hidden w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-all duration-150 lg:flex ${
                      isActive
                        ? "bg-accent/10 text-accent"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <svg
                      className="h-3.5 w-3.5 shrink-0 opacity-50"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.2 48.2 0 005.068-.506c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                      />
                    </svg>
                    <div className="relative flex min-w-0 flex-1 items-center justify-between gap-2">
                      {renamingId === conv.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitRename();
                            } else if (e.key === "Escape") {
                              cancelRename();
                            }
                          }}
                          onBlur={commitRename}
                          onClick={(e) => e.stopPropagation()}
                          className="min-w-0 flex-1 rounded-md border border-accent/40 bg-surface-raised px-1.5 py-0.5 text-[13px] text-foreground outline-none ring-1 ring-accent/30"
                          aria-label="Conversation title"
                        />
                      ) : (
                        <>
                          <span
                            className={`truncate text-[13px] ${
                              isActive ? "font-medium" : ""
                            }`}
                          >
                            {conv.title ?? "New conversation"}
                          </span>
                          <span className="shrink-0 text-[10px] opacity-50 group-hover:hidden">
                            {timeAgo(conv.updatedAt)}
                          </span>
                          <div
                            ref={
                              openMenuId === conv.id ? menuWrapRef : undefined
                            }
                            className="relative shrink-0"
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(
                                  openMenuId === conv.id ? null : conv.id,
                                );
                              }}
                              className={`h-5 w-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground ${
                                openMenuId === conv.id
                                  ? "flex bg-muted text-foreground"
                                  : "hidden group-hover:flex"
                              }`}
                              title="More"
                              aria-label="Conversation options"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <circle cx="5" cy="12" r="1.6" />
                                <circle cx="12" cy="12" r="1.6" />
                                <circle cx="19" cy="12" r="1.6" />
                              </svg>
                            </button>

                            {openMenuId === conv.id && (
                              <div className="absolute right-0 top-6 z-50 flex min-w-[140px] flex-col rounded-lg border border-border bg-surface-raised p-1 shadow-xl">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startRename(conv.id, conv.title);
                                  }}
                                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-foreground transition-colors hover:bg-muted"
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
                                      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
                                    />
                                  </svg>
                                  Rename
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteConversation(conv.id);
                                  }}
                                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-red-500 transition-colors hover:bg-red-500/10"
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
                                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                    />
                                  </svg>
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Connection Status + User */}
      <div className="flex flex-col gap-1 border-t border-border p-3">
        {/* Integration indicators */}
        <div className="hidden flex-col gap-1 px-2.5 py-1.5 lg:flex">
          <div className="flex items-center gap-2">
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                isMicrosoftConnected
                  ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]"
                  : "bg-zinc-400 dark:bg-zinc-600"
              }`}
            />
            <span className="text-[11px] text-muted-foreground">
              {isMicrosoftConnected
                ? "Microsoft connected"
                : "Microsoft not connected"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                isGoogleConnected
                  ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]"
                  : "bg-zinc-400 dark:bg-zinc-600"
              }`}
            />
            <span className="text-[11px] text-muted-foreground">
              {isGoogleConnected
                ? "Google Calendar connected"
                : "Google Calendar not connected"}
            </span>
          </div>
        </div>

        {/* User section */}
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          {user?.image ? (
            // Real profile photo when the user has one (Google /
            // Microsoft sign-in populates user.image). Instantly
            // recognizable signal of which account is active —
            // initials alone made it hard to spot a wrong-account
            // sign-in.
            <img
              src={user.image}
              alt=""
              referrerPolicy="no-referrer"
              className="h-7 w-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
              {initials}
            </div>
          )}
          <div className="hidden min-w-0 flex-1 lg:block">
            <p className="truncate text-[13px] font-medium text-foreground">
              {user?.name || "User"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {user?.email}
            </p>
          </div>
        </div>

        {/* Sign out button */}
        <button
          onClick={handleSignOut}
          className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground lg:justify-start"
        >
          <svg
            className="h-4 w-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
            />
          </svg>
          <span className="hidden lg:block">Sign out</span>
        </button>
      </div>
    </aside>
  );
}

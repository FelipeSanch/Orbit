"use client";

import { useEffect, useRef, useState } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
  value?: string;
  onChange?: (value: string) => void;
}

interface AttachedFile {
  id: string;
  name: string;
  size: number;
  kind: "text" | "image" | "other";
  content?: string; // text content for inlining
}

const TEXT_EXTS = new Set([
  "txt",
  "md",
  "json",
  "csv",
  "html",
  "htm",
  "log",
  "py",
  "ts",
  "tsx",
  "js",
  "jsx",
  "css",
  "yml",
  "yaml",
  "xml",
]);
const IMG_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

function classifyFile(name: string): AttachedFile["kind"] {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (TEXT_EXTS.has(ext)) return "text";
  if (IMG_EXTS.has(ext)) return "image";
  return "other";
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function ChatInput({
  onSend,
  disabled,
  value = "",
  onChange,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const handleChange = (val: string) => {
    onChange?.(val);
  };

  const buildMessage = (): string => {
    let body = value.trim();
    const textFiles = attachments.filter(
      (a) => a.kind === "text" && a.content,
    );
    if (textFiles.length > 0) {
      const parts = textFiles.map(
        (f) => `--- attached: ${f.name} ---\n${f.content}`,
      );
      body = body
        ? `${body}\n\n${parts.join("\n\n")}`
        : parts.join("\n\n");
    }
    const otherFiles = attachments.filter((a) => a.kind !== "text");
    if (otherFiles.length > 0) {
      const names = otherFiles.map((f) => f.name).join(", ");
      const note = `(also attached: ${names} — non-text uploads not yet processed)`;
      body = body ? `${body}\n${note}` : note;
    }
    return body;
  };

  const handleSubmit = () => {
    const trimmed = buildMessage().trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    handleChange("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const next: AttachedFile[] = [];
    for (const file of Array.from(fileList)) {
      const kind = classifyFile(file.name);
      const att: AttachedFile = {
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        size: file.size,
        kind,
      };
      if (kind === "text") {
        try {
          let txt = await readAsText(file);
          // Cap inlined text at 16KB so we don't blow up the prompt
          if (txt.length > 16_000) {
            txt = txt.slice(0, 16_000) + "\n... (truncated)";
          }
          att.content = txt;
        } catch {
          att.content = "(could not read)";
        }
      }
      next.push(att);
    }
    setAttachments((prev) => [...prev, ...next]);
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  const useQuickPrompt = (prompt: string) => {
    handleChange(prompt);
    setMenuOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const QUICK_PROMPTS = [
    "What should I focus on today?",
    "Anything urgent in my inbox?",
    "Summarize my upcoming week.",
  ];

  return (
    // Floating composer — Claude-style. No top border, no full-width
    // chrome bar. Sits over the chat with breathing room on all sides
    // so it reads as an inviting target instead of a sealed footer.
    <div className="shrink-0 px-4 pb-4 sm:px-6 sm:pb-5">
      <div className="mx-auto max-w-3xl">
        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2 py-1 text-[11px] text-foreground"
              >
                <svg
                  className="h-3 w-3 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
                  />
                </svg>
                <span className="max-w-[160px] truncate">{a.name}</span>
                <button
                  onClick={() => removeAttachment(a.id)}
                  className="cursor-pointer text-muted-foreground/70 hover:text-foreground"
                  aria-label={`Remove ${a.name}`}
                >
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-2 rounded-3xl border border-border bg-surface-raised p-2 shadow-lg shadow-black/5 transition-all duration-150 focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/10">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />

          {/* Plus button + menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={disabled}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="More actions"
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
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute bottom-10 left-0 z-30 flex min-w-[220px] flex-col gap-0.5 rounded-xl border border-border bg-surface-raised p-1 shadow-2xl">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12px] text-foreground transition-colors hover:bg-muted"
                >
                  <svg
                    className="h-4 w-4 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
                    />
                  </svg>
                  Add files or photos
                </button>

                <div className="my-1 h-px bg-border/60" />

                <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Quick prompts
                </div>
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => useQuickPrompt(p)}
                    className="flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12px] text-foreground transition-colors hover:bg-muted"
                  >
                    <svg
                      className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.75}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
                      />
                    </svg>
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Message Orbit..."
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
            style={{ maxHeight: "160px" }}
          />

          <button
            onClick={handleSubmit}
            disabled={
              disabled || (!value.trim() && attachments.length === 0)
            }
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-accent-foreground transition-all duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:brightness-100"
            aria-label="Send"
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
                d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
              />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/40">
          Orbit can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}

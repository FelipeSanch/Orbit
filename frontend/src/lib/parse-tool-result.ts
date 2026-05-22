import type {
  EmailItem,
  EventItem,
  StructuredData,
  TaskItem,
} from "@/types/events";

const EMAIL_TOOLS = new Set(["list_emails", "search_emails"]);
const EVENT_TOOLS = new Set(["list_events"]);
const TASK_TOOLS = new Set(["list_tasks"]);

/**
 * Parse a tool_result payload into a StructuredData shape when the
 * tool was a list-style read. Returns null otherwise (write tools,
 * single-record reads, errors, anything we don't intentionally
 * render as cards).
 *
 * Falls back gracefully on malformed JSON or missing fields — the
 * agent's prose carries the answer regardless; cards are an
 * enhancement, not a replacement.
 */
export function parseToolResultForCards(
  toolName: string | undefined,
  rawResult: string | undefined,
): StructuredData | null {
  if (!toolName || !rawResult) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResult);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if ("error" in obj) return null;
  const items = obj.items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const provider = typeof obj.provider === "string" ? obj.provider : "";

  if (EMAIL_TOOLS.has(toolName)) {
    return { kind: "emails", provider, items: items as EmailItem[] };
  }
  if (EVENT_TOOLS.has(toolName)) {
    return { kind: "events", provider, items: items as EventItem[] };
  }
  if (TASK_TOOLS.has(toolName)) {
    return { kind: "tasks", provider, items: items as TaskItem[] };
  }
  return null;
}

/**
 * Pretty-print the provider value the backend returns. Mirrors the
 * agent's microcopy ("your Outlook inbox", "your Google Calendar").
 */
export function providerLabel(provider: string): string {
  switch (provider) {
    case "outlook":
    case "outlook_mail":
      return "Outlook";
    case "outlook_calendar":
      return "Outlook Calendar";
    case "google_calendar":
      return "Google Calendar";
    case "ms_todo":
      return "Microsoft To Do";
    default:
      return provider || "Provider";
  }
}

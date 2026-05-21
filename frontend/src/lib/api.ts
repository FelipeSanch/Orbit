import { env } from "./env";

export function sendChatMessage(
  message: string,
  conversationId: string | null,
  token: string,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const controller = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const responsePromise = fetch(`${env.apiUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
    }),
    signal: controller.signal,
  });

  return new ReadableStream({
    async start(streamController) {
      try {
        const response = await responsePromise;

        if (!response.ok) {
          const errorText = await response.text();
          streamController.error(new Error(`HTTP ${response.status}: ${errorText}`));
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          streamController.error(new Error("No response body"));
          return;
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          streamController.enqueue(value);
        }

        streamController.close();
      } catch (error) {
        streamController.error(error);
      }
    },
    cancel() {
      controller.abort();
    },
  });
}

async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, init);
  } catch {
    // Network error (backend down, CORS preflight failed, reload blip).
    // Callers get null and decide their own fallback.
    return null;
  }
}

export async function renameConversation(
  conversationId: string,
  title: string,
  token: string,
): Promise<boolean> {
  const response = await safeFetch(
    `${env.apiUrl}/api/conversations/${conversationId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title }),
    },
  );
  return response?.ok ?? false;
}

export async function deleteConversation(
  conversationId: string,
  token: string,
): Promise<boolean> {
  const response = await safeFetch(
    `${env.apiUrl}/api/conversations/${conversationId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return response?.ok ?? false;
}

export async function fetchConversations(
  token: string,
): Promise<{ id: string; title: string | null; created_at: string; updated_at: string }[]> {
  const response = await safeFetch(`${env.apiUrl}/api/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response || !response.ok) return [];
  return response.json();
}

export async function fetchMemories(token: string): Promise<
  { id: string; memory: string; topics: string[]; updated_at: string | null }[]
> {
  const response = await safeFetch(`${env.apiUrl}/api/memories`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response || !response.ok) return [];
  return response.json();
}

export async function deleteMemory(
  memoryId: string,
  token: string,
): Promise<boolean> {
  const response = await safeFetch(`${env.apiUrl}/api/memories/${memoryId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return response?.ok ?? false;
}

export type AuthUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: "network" | "unauthorized" | "server" | "malformed"; status?: number };

async function fetchAuthUrl(path: string, token: string): Promise<AuthUrlResult> {
  // OAuth start returns the authorize URL as JSON. Token travels in the
  // Authorization header — never as a ?authorization= query param, which
  // would leak to proxy logs and browser history.
  // Returns a tagged result so the caller can surface the failure mode
  // instead of silently no-op'ing the Connect button.
  const response = await safeFetch(`${env.apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response) return { ok: false, reason: "network" };
  if (response.status === 401) return { ok: false, reason: "unauthorized", status: 401 };
  if (!response.ok) return { ok: false, reason: "server", status: response.status };
  try {
    const data = await response.json();
    if (typeof data?.url === "string") return { ok: true, url: data.url };
    return { ok: false, reason: "malformed" };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

export function getMicrosoftAuthUrl(token: string): Promise<AuthUrlResult> {
  return fetchAuthUrl("/api/auth/microsoft", token);
}

export function getGoogleAuthUrl(token: string): Promise<AuthUrlResult> {
  return fetchAuthUrl("/api/auth/google", token);
}

export interface TelegramPairing {
  code: string;
  bot_username: string;
  deeplink: string;
  expires_in_seconds: number;
}

export type TelegramPairResult =
  | { ok: true; pairing: TelegramPairing }
  | {
      ok: false;
      reason: "network" | "unauthorized" | "server" | "malformed" | "unconfigured";
      message?: string;
      status?: number;
    };

export async function pairTelegram(token: string): Promise<TelegramPairResult> {
  const response = await safeFetch(`${env.apiUrl}/api/channels/telegram/pair`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response) return { ok: false, reason: "network" };
  if (response.status === 401)
    return { ok: false, reason: "unauthorized", status: 401 };
  if (response.status === 503) {
    // Bot token not configured server-side; surface the server's message.
    try {
      const body = await response.json();
      return { ok: false, reason: "unconfigured", message: body?.detail };
    } catch {
      return { ok: false, reason: "unconfigured" };
    }
  }
  if (!response.ok) return { ok: false, reason: "server", status: response.status };
  try {
    const data = (await response.json()) as TelegramPairing;
    if (typeof data?.code === "string" && typeof data?.deeplink === "string") {
      return { ok: true, pairing: data };
    }
    return { ok: false, reason: "malformed" };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

export interface TelegramStatus {
  connected: boolean;
  chat_id?: string;
  verified_at?: string;
}

export async function fetchTelegramStatus(
  token: string,
): Promise<TelegramStatus | null> {
  const response = await safeFetch(`${env.apiUrl}/api/channels/telegram/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response || !response.ok) return null;
  try {
    return (await response.json()) as TelegramStatus;
  } catch {
    return null;
  }
}

export async function disconnectTelegram(token: string): Promise<boolean> {
  const response = await safeFetch(`${env.apiUrl}/api/channels/telegram`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return response?.ok ?? false;
}

export async function fetchUsageToday(token: string): Promise<{
  messages: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
} | null> {
  const response = await safeFetch(`${env.apiUrl}/api/usage/today`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response || !response.ok) return null;
  return response.json();
}

export async function fetchConversation(
  conversationId: string,
  token: string,
): Promise<{
  id: string;
  title: string | null;
  messages: { id: string; role: string; content: string; created_at: string }[];
} | null> {
  const response = await safeFetch(
    `${env.apiUrl}/api/conversations/${conversationId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response || !response.ok) return null;
  return response.json();
}

export function approveAction(
  approvalId: string,
  approved: boolean,
  token: string,
): ReadableStream<Uint8Array> {
  const controller = new AbortController();

  const responsePromise = fetch(`${env.apiUrl}/api/chat/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ approval_id: approvalId, approved }),
    signal: controller.signal,
  });

  return new ReadableStream({
    async start(streamController) {
      try {
        const response = await responsePromise;

        if (!response.ok) {
          const errorText = await response.text();
          streamController.error(
            new Error(`HTTP ${response.status}: ${errorText}`),
          );
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          streamController.error(new Error("No response body"));
          return;
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          streamController.enqueue(value);
        }

        streamController.close();
      } catch (error) {
        streamController.error(error);
      }
    },
    cancel() {
      controller.abort();
    },
  });
}

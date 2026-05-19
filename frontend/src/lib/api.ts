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

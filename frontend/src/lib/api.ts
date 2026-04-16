import { env } from "./env";

export function sendChatMessage(
  message: string,
  conversationId: string | null,
  sessionId: string,
  token: string,
): ReadableStream<Uint8Array> {
  const controller = new AbortController();

  const responsePromise = fetch(`${env.apiUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
      session_id: sessionId,
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

export async function approveAction(
  approvalId: string,
  approved: boolean,
  token: string,
): Promise<{ status: string; approval_id: string; tool_name: string }> {
  const response = await fetch(`${env.apiUrl}/api/chat/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ approval_id: approvalId, approved }),
  });

  if (!response.ok) {
    throw new Error(`Approval failed: ${response.status}`);
  }

  return response.json();
}

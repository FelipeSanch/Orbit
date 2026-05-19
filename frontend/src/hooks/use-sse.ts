"use client";

import { useCallback, useRef, useState } from "react";
import type { SSEEventType } from "@/types/events";

interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
}

type EventHandler = (event: SSEEvent) => void;

function parseSSEEvents(chunk: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  // Normalize CRLF to LF so we can split on \n\n regardless of server line endings
  const normalized = chunk.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n").filter(Boolean);

  for (const block of blocks) {
    const lines = block.split("\n");
    let eventType: SSEEventType = "content_delta";
    let data = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim() as SSEEventType;
      } else if (line.startsWith("data:")) {
        data = line.slice(5).trim();
      }
    }

    if (data) {
      try {
        events.push({ type: eventType, data: JSON.parse(data) });
      } catch {
        // Skip malformed events
      }
    }
  }

  return events;
}

export function useSSE(onEvent: EventHandler) {
  const [isConnected, setIsConnected] = useState(false);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const connect = useCallback(
    async (stream: ReadableStream<Uint8Array>) => {
      setIsConnected(true);
      const reader = stream.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete events (separated by double newline)
          // Normalize CRLF to LF in buffer for consistent splitting
          buffer = buffer.replace(/\r\n/g, "\n");
          const lastDoubleNewline = buffer.lastIndexOf("\n\n");
          if (lastDoubleNewline !== -1) {
            const complete = buffer.slice(0, lastDoubleNewline + 2);
            buffer = buffer.slice(lastDoubleNewline + 2);

            const events = parseSSEEvents(complete);
            for (const event of events) {
              onEvent(event);
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          const events = parseSSEEvents(buffer);
          for (const event of events) {
            onEvent(event);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          onEvent({
            type: "error",
            data: { message: error.message, code: "stream_error" },
          });
        }
      } finally {
        setIsConnected(false);
        readerRef.current = null;
      }
    },
    [onEvent],
  );

  const disconnect = useCallback(() => {
    readerRef.current?.cancel();
    readerRef.current = null;
    setIsConnected(false);
  }, []);

  return { connect, disconnect, isConnected };
}

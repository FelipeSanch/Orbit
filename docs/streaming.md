# SSE Streaming Design

## Protocol

Chat responses stream from backend to frontend via Server-Sent Events over a POST request.

### Connection Flow

1. Frontend sends `POST /api/chat` with `{message, conversation_id?, session_id?}`
2. Backend returns `Content-Type: text/event-stream`
3. Frontend reads response body as `ReadableStream`, parses SSE events
4. Each event has `event:` type and `data:` JSON payload

### Event Types

| Event | Payload | Description |
|-------|---------|-------------|
| `stream_start` | `{run_id, conversation_id}` | Run begins. Includes conversation_id for new conversations. |
| `content_delta` | `{delta: string}` | Incremental text chunk from the model. |
| `content_done` | `{full_content: string}` | Complete response text. |
| `tool_call` | `{tool_name, tool_args, tool_call_id}` | Agent is calling a tool (read or write). |
| `tool_result` | `{tool_call_id, result}` | Tool returned a result. |
| `approval_required` | `{approval_id, tool_name, tool_args, tool_call_id, run_id}` | Write tool needs user confirmation. |
| `agent_delegation` | `{to_agent, task}` | Team leader delegated to a specialist. |
| `error` | `{message, code}` | Error occurred during the run. |
| `stream_end` | `{run_id}` | Run complete. |

### Wire Format

```
event: content_delta
data: {"delta": "Here are your "}

event: content_delta
data: {"delta": "upcoming meetings:"}

event: tool_call
data: {"tool_name": "list_events", "tool_args": {}, "tool_call_id": "tc_123"}

event: tool_result
data: {"tool_call_id": "tc_123", "result": "[{\"summary\":\"Team standup\"...}]"}

event: content_done
data: {"full_content": "Here are your upcoming meetings:\n\n- Team standup..."}

event: stream_end
data: {"run_id": "run_abc"}
```

## Approval Flow Sequence

```
Frontend                    Backend                     Database
   │                           │                           │
   │  POST /api/chat          │                           │
   │  {message: "send email"} │                           │
   │─────────────────────────>│                           │
   │                          │                           │
   │  event: content_delta    │                           │
   │<─────────────────────────│                           │
   │  event: tool_call        │                           │
   │<─────────────────────────│                           │
   │                          │  INSERT pending_approvals │
   │  event: approval_required│──────────────────────────>│
   │<─────────────────────────│                           │
   │  event: stream_end       │                           │
   │<─────────────────────────│                           │
   │                          │                           │
   │  [User clicks Approve]   │                           │
   │                          │                           │
   │  POST /api/chat/approve  │                           │
   │  {approval_id, approved} │  UPDATE status='approved' │
   │─────────────────────────>│──────────────────────────>│
   │                          │                           │
   │  {status: "approved"}    │                           │
   │<─────────────────────────│                           │
```

## Frontend Implementation

Uses `fetch()` with `ReadableStream` instead of `EventSource` (which only supports GET):

```typescript
const response = await fetch(url, { method: 'POST', body, headers });
const reader = response.body.getReader();
// Parse SSE events from chunks
```

Events are dispatched to two Zustand stores simultaneously:
- `useChatStore` — message content, streaming state, approvals
- `useActivityStore` — tool calls, delegations for the activity feed

"""Helpers for keeping slow / failing Microsoft Graph and Google API calls
from hanging the SSE stream.

We enforce the timeout at the HTTP-client level (not via asyncio.wait_for)
because the O365 and googleapiclient libraries make synchronous requests
under the hood — asyncio cannot preempt those. The constants here are
applied to:

  - O365's Connection.timeout (services/token_manager._build_account)
  - googleapiclient's underlying httplib2.Http instance
    (tools/google_calendar._service)

`format_graph_error` is called from the event translator's tool-error
path to turn library-specific exceptions into one normalized string the
agent and frontend can both parse.

Both thresholds are env-overridable so we can tune them from observed
tool-duration data without redeploys:
  ORBIT_GRAPH_TIMEOUT_S          → HTTP_TIMEOUT_S
  ORBIT_TOOL_PROGRESS_THRESHOLD_S → TOOL_PROGRESS_THRESHOLD_S
"""

from __future__ import annotations

import json
import os
import re


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


# Single timeout for any outbound Graph / Google API request, in seconds.
# Above this, the HTTP library raises and the tool surfaces a clean error.
HTTP_TIMEOUT_S: float = _env_float("ORBIT_GRAPH_TIMEOUT_S", 30.0)

# Emitted as a tool_progress SSE event if a tool call hasn't completed by
# this many seconds. Below the HTTP timeout so the user sees activity
# before the tool would otherwise error out.
TOOL_PROGRESS_THRESHOLD_S: float = _env_float(
    "ORBIT_TOOL_PROGRESS_THRESHOLD_S", 5.0
)


_RETRY_AFTER_RE = re.compile(r"Retry-After['\":\s]+(\d+)", re.IGNORECASE)


def _looks_like_timeout(err: str) -> bool:
    return any(
        marker in err
        for marker in (
            "Read timed out",
            "ReadTimeout",
            "ConnectTimeout",
            "ConnectionError",
            "Timeout",
        )
    )


def _looks_like_429(err: str) -> bool:
    return "429" in err or "Too Many Requests" in err or "TooManyRequests" in err


def _parse_retry_after(err: str) -> int | None:
    m = _RETRY_AFTER_RE.search(err)
    if not m:
        return None
    try:
        return int(m.group(1))
    except (ValueError, TypeError):
        return None


def format_graph_error(error: object, *, tool_name: str) -> str:
    """Translate a Graph / Google library exception into a typed JSON string.

    Returns a JSON object like:
      {"error": "...", "code": "graph_timeout"|"graph_throttled"|"graph_error", ...}

    Designed to live inside a tool's tool_result so the agent can read it
    and tell the user something coherent.
    """
    err_str = str(error)

    if _looks_like_429(err_str):
        payload = {
            "error": f"Microsoft Graph is rate-limiting {tool_name}. Please try again shortly.",
            "code": "graph_throttled",
        }
        retry = _parse_retry_after(err_str)
        if retry is not None:
            payload["retry_after_s"] = retry
        return json.dumps(payload)

    if _looks_like_timeout(err_str):
        return json.dumps(
            {
                "error": (
                    f"{tool_name} timed out talking to Microsoft Graph "
                    f"(over {int(HTTP_TIMEOUT_S)}s). It may have completed on their side."
                ),
                "code": "graph_timeout",
            }
        )

    return json.dumps(
        {
            "error": f"{tool_name} failed: {err_str[:300]}",
            "code": "graph_error",
        }
    )

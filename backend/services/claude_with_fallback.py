"""Claude model wrapper with per-turn fallback to a smaller model.

When Anthropic returns a sustained `overloaded_error` (HTTP 529) — i.e.
the primary model exhausts its `max_retries` budget — we transparently
re-issue the same request against a smaller fallback model so the user
gets a response (with degraded quality) instead of a hard error.

Designed for specialist agents (Sonnet 4.6 → Haiku 4.5). The
orchestrator already runs Haiku, so it doesn't need a fallback chain.

Fallback is per-turn, not per-conversation: `self.id` is restored to
the primary in `finally`, so the next turn tries Sonnet again. This
preserves quality once Anthropic recovers.

Observability: every fallback fires the user-supplied `on_fallback`
callback synchronously with (primary_id, fallback_id, reason). Callers
typically log to a structured logger and write a `model_fallback` row
to activity_log.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Callable, Dict, List, Optional, Type, Union

from agno.exceptions import ModelRateLimitError
from agno.models.anthropic import Claude
from pydantic import BaseModel

logger = logging.getLogger(__name__)

FallbackCallback = Callable[[str, str, str], None]


def _is_overloaded(e: BaseException) -> bool:
    """True if this error represents an Anthropic overload (HTTP 529)."""
    msg = str(e).lower()
    return "overloaded" in msg or "529" in msg


@dataclass
class FallbackClaude(Claude):
    """Claude wrapper that falls back to a smaller model on sustained overload.

    The primary model id is `self.id` (set at construction, e.g.
    `claude-sonnet-4-6`). The fallback id is `self.fallback_id`
    (e.g. `claude-haiku-4-5-20251001`). Fallback fires after the
    Anthropic SDK's own retry budget is exhausted — never on the first
    529 — because we only see `ModelRateLimitError` after retries are
    done.
    """

    fallback_id: str = "claude-haiku-4-5-20251001"
    on_fallback: Optional[FallbackCallback] = field(default=None, repr=False)

    def _notify_fallback(self, primary: str, reason: str) -> None:
        logger.warning(
            "model_fallback primary=%s fallback=%s reason=%s",
            primary,
            self.fallback_id,
            reason[:200],
        )
        if self.on_fallback:
            try:
                self.on_fallback(primary, self.fallback_id, reason[:500])
            except Exception:
                logger.exception("on_fallback callback raised")

    async def ainvoke(
        self,
        messages: List[Any],
        assistant_message: Any,
        response_format: Optional[Union[Dict, Type[BaseModel]]] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Union[str, Dict[str, Any]]] = None,
        run_response: Optional[Any] = None,
        compress_tool_results: bool = False,
    ) -> Any:
        primary = self.id
        try:
            return await super().ainvoke(
                messages,
                assistant_message,
                response_format=response_format,
                tools=tools,
                tool_choice=tool_choice,
                run_response=run_response,
                compress_tool_results=compress_tool_results,
            )
        except ModelRateLimitError as e:
            if not _is_overloaded(e):
                raise
            self._notify_fallback(primary, str(e))
            self.id = self.fallback_id
            try:
                return await super().ainvoke(
                    messages,
                    assistant_message,
                    response_format=response_format,
                    tools=tools,
                    tool_choice=tool_choice,
                    run_response=run_response,
                    compress_tool_results=compress_tool_results,
                )
            finally:
                self.id = primary

    async def ainvoke_stream(
        self,
        messages: List[Any],
        assistant_message: Any,
        response_format: Optional[Union[Dict, Type[BaseModel]]] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Union[str, Dict[str, Any]]] = None,
        run_response: Optional[Any] = None,
        compress_tool_results: bool = False,
    ) -> AsyncIterator[Any]:
        primary = self.id
        yielded = False
        try:
            async for chunk in super().ainvoke_stream(
                messages,
                assistant_message,
                response_format=response_format,
                tools=tools,
                tool_choice=tool_choice,
                run_response=run_response,
                compress_tool_results=compress_tool_results,
            ):
                yielded = True
                yield chunk
            return
        except ModelRateLimitError as e:
            # Only fall back if (a) it's an overload AND (b) no chunks
            # have streamed yet. Mid-stream overloads can't be cleanly
            # restarted — surface them as-is.
            if yielded or not _is_overloaded(e):
                raise
            self._notify_fallback(primary, str(e))

        # Fallback path runs OUTSIDE the try/except above so the
        # async-generator semantics behave cleanly: discard the failed
        # primary stream entirely, restart with the fallback model.
        self.id = self.fallback_id
        try:
            async for chunk in super().ainvoke_stream(
                messages,
                assistant_message,
                response_format=response_format,
                tools=tools,
                tool_choice=tool_choice,
                run_response=run_response,
                compress_tool_results=compress_tool_results,
            ):
                yield chunk
        finally:
            self.id = primary

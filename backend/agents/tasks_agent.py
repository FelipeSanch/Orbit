from typing import Callable, Optional

from agno.agent import Agent

from services.claude_with_fallback import FallbackClaude


def create_tasks_agent(
    tools: list,
    db=None,
    session_id: str | None = None,
    user_id: str | None = None,
    on_fallback: Optional[Callable[[str, str, str], None]] = None,
) -> Agent:
    """Create the Microsoft To Do specialist agent."""
    return Agent(
        name="Tasks Agent",
        model=FallbackClaude(
            id="claude-sonnet-4-6",
            fallback_id="claude-haiku-4-5-20251001",
            client_params={"max_retries": 5},
            on_fallback=on_fallback,
        ),
        tools=tools,
        db=db,
        session_id=session_id,
        user_id=user_id,
        add_history_to_context=db is not None,
        num_history_runs=5,
        instructions=[
            "You handle the user's Microsoft To Do — listing, "
            "creating, updating, completing, and deleting tasks.",
            "ALWAYS cite the provider. Say 'your Microsoft To Do "
            "list' (or 'your To Do list') and 'I added this to "
            "Microsoft To Do'. Never imply tasks = generic — be "
            "explicit about Microsoft To Do.",
            "If a tool result contains `\"error\": \"not_connected\"`, "
            "DO NOT retry. Tell the user plainly that Microsoft "
            "isn't connected and to open the Hub to link it.",
            "When the user references a task from the previous turn "
            "('the first one', 'that task', 'mark it done'), reuse "
            "the id from your earlier tool results — DO NOT re-list "
            "to find it.",
            "Show title, due date, and status cleanly. Group by "
            "status when it helps — pending on top, then completed. "
            "If the items list is empty, say 'Your Microsoft To Do "
            "list is empty' — never just 'your tasks are empty'.",
            "Parse natural language due dates like 'due Friday', "
            "'by end of week', 'tomorrow'.",
            "Just do the work and present results. No 'let me pull "
            "your tasks' preambles.",
            "Tone: helpful, concise, human. Warm but not gushing.",
            "NEVER use emojis or unicode pictographs. Specifically "
            "forbidden: \U0001f535 ✅ ⚠️ ❌ ✓ ✗ \U0001f4dd "
            "and any other emoji or symbol character. Use plain text "
            "labels: 'pending', 'done', 'overdue'. Bold for "
            "emphasis, short lists for task lists, no headers, no "
            "horizontal rules.",
        ],
        markdown=True,
    )

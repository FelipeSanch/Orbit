# Agents

## Team Structure

Orbit uses an Agno `Team` in **route mode** with three specialist agents.

```
Orchestrator (Team Leader)
├── Email Agent    — Outlook Mail read/write/search
├── Calendar Agent — Outlook Calendar CRUD
└── Tasks Agent    — Microsoft To Do CRUD
```

## Orchestrator

- **Model:** Claude Sonnet 4.6
- **Mode:** Route — analyzes message, delegates to one specialist
- **Memory:** Agno Memory with PostgresMemoryDb (stores user preferences across sessions)
- **Storage:** PostgresStorage (persists session history)

### Routing Logic

The team leader decides delegation based on keywords and intent:
- Email-related terms → Email Agent
- Calendar/meeting/schedule terms → Calendar Agent
- Task/todo/checklist terms → Tasks Agent
- Cross-domain → sequential delegation to multiple agents, synthesized response

## Email Agent

- **Tools:** `list_emails`, `get_email`, `search_emails`, `send_email*`, `reply_to_email*`, `trash_email*`, `move_email*`
- **Behavior:** Lists include subject, sender, date, snippet. Suggests search refinements on empty results.
- `*` = requires confirmation

## Calendar Agent

- **Tools:** `list_events`, `get_event`, `create_event*`, `update_event*`, `delete_event*`
- **Behavior:** Defaults to today's events. Parses natural language times. Warns about conflicts.
- `*` = requires confirmation

## Tasks Agent

- **Tools:** `list_task_lists`, `list_tasks`, `get_task`, `create_task*`, `update_task*`, `complete_task*`, `delete_task*`
- **Behavior:** Groups by status. Parses natural language due dates.
- `*` = requires confirmation

## Tool Schema Convention

All tools use `@tool` decorator with docstrings that include an `Args:` section. The LLM reads this as the tool schema:

```python
@tool(requires_confirmation=True)
async def send_email(to: str, subject: str, body: str) -> str:
    """Send an email via Outlook.

    Args:
        to: Recipient email address.
        subject: Email subject line.
        body: Email body text.
    """
```

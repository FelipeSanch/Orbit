from agno.agent import Agent
from agno.models.anthropic import Claude


def create_tasks_agent(tools: list) -> Agent:
    """Create the tasks specialist agent."""
    return Agent(
        name="Tasks Agent",
        model=Claude(id="claude-sonnet-4-6"),
        tools=tools,
        instructions=[
            "You handle the user's Microsoft To Do — listing, "
            "creating, updating, completing, and deleting tasks.",
            "Show title, due date, and status cleanly. Group by "
            "status when it helps — pending on top, then completed.",
            "Parse natural language due dates like 'due Friday', "
            "'by end of week', 'tomorrow'.",
            "Just do the work and present results. No 'let me pull "
            "your tasks' preambles.",
            "Tone: helpful, concise, human. Warm but not gushing. "
            "Never use emojis. Plain prose — bold for emphasis, "
            "short lists for task lists, no headers or horizontal "
            "rules.",
        ],
        markdown=True,
    )

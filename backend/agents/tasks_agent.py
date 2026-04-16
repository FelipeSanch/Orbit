from agno.agent import Agent
from agno.models.anthropic import Claude


def create_tasks_agent(tools: list) -> Agent:
    """Create the tasks specialist agent."""
    return Agent(
        name="Tasks Agent",
        model=Claude(id="claude-sonnet-4-5-20250929"),
        tools=tools,
        instructions=[
            "You are a task management specialist for the Orbit assistant.",
            "You handle all Microsoft To Do operations: listing, creating, updating, "
            "completing, and deleting.",
            "When listing tasks, show title, due date, and status clearly.",
            "Group tasks by status (pending vs completed) when showing lists.",
            "Parse natural language due dates (e.g. 'due Friday', 'by end of week').",
            "Suggest task organization when the user has many tasks.",
            "Celebrate task completions briefly to encourage productivity.",
        ],
        show_tool_calls=True,
        markdown=True,
    )

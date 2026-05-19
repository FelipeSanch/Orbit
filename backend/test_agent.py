"""Standalone test script for the Orbit agent team.

Usage:
    cd backend && python test_agent.py

Requires:
    - .env file with valid ANTHROPIC_API_KEY and Microsoft OAuth tokens stored
    - A connected Microsoft account in the integrations table
"""

import asyncio

from dotenv import load_dotenv

load_dotenv()

from services.agent_factory import create_team_for_user  # noqa: E402


async def main() -> None:
    # Replace with a real user_id from the public.users table
    user_id = "test-user-id"
    session_id = "test-session"

    team = await create_team_for_user(user_id, session_id)

    test_queries = [
        "What are my upcoming calendar events today?",
        "Show me my recent emails",
        "What tasks do I have?",
    ]

    for query in test_queries:
        print(f"\n{'=' * 60}")
        print(f"Query: {query}")
        print("=" * 60)

        response = await team.arun(query)
        print(f"\nResponse:\n{response.content}")


if __name__ == "__main__":
    asyncio.run(main())

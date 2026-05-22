import json
from datetime import datetime

from agno.tools.decorator import tool

from services.graph_safety import ensure_ok
from services.token_manager import TokenManager

PROVIDER = "ms_todo"


def _not_connected_payload() -> str:
    return json.dumps(
        {
            "provider": PROVIDER,
            "error": "not_connected",
            "message": (
                "Microsoft 365 isn't connected. Open the Hub and link your "
                "Microsoft account to use Microsoft To Do."
            ),
        }
    )


def create_tasks_tools(token_manager: TokenManager, user_id: str) -> list:
    """Create Microsoft To Do tool functions with credentials bound via closure."""

    async def _get_todo():
        try:
            account = await token_manager.get_account(user_id)
        except ValueError as e:
            if "not connected" in str(e).lower():
                return None
            raise
        return account.tasks()

    @tool
    async def list_task_lists() -> str:
        """List all task lists for the user."""
        todo = await _get_todo()
        if todo is None:
            return _not_connected_payload()
        folders = todo.get_folders()

        task_lists = []
        for folder in folders:
            task_lists.append(
                {
                    "id": folder.object_id,
                    "name": folder.name or "",
                }
            )

        return json.dumps({"provider": PROVIDER, "items": task_lists})

    @tool
    async def list_tasks(task_list_id: str = "", include_completed: bool = False) -> str:
        """List tasks in a task list.

        Args:
            task_list_id: Task list ID. Empty for the default list.
            include_completed: Whether to include completed tasks. Default false.
        """
        todo = await _get_todo()
        if todo is None:
            return _not_connected_payload()

        if task_list_id:
            folder = todo.get_folder(folder_id=task_list_id)
        else:
            folder = todo.get_default_folder()

        tasks_iter = folder.get_tasks()

        tasks = []
        for task in tasks_iter:
            if not include_completed and task.is_completed:
                continue
            tasks.append(
                {
                    "id": task.object_id,
                    "title": task.subject or "",
                    "body": task.body or "",
                    "due": task.due.isoformat() if task.due else "",
                    "status": task.status or "",
                    "importance": (str(task.importance) if task.importance else "normal"),
                    "is_completed": task.is_completed,
                    "completed_date": (
                        task.completed_date.isoformat()
                        if getattr(task, "completed_date", None)
                        else ""
                    ),
                }
            )

        return json.dumps({"provider": PROVIDER, "items": tasks})

    @tool
    async def get_task(task_id: str, task_list_id: str = "") -> str:
        """Get details of a specific task.

        Args:
            task_id: The task ID.
            task_list_id: Task list ID. Empty for the default list.
        """
        todo = await _get_todo()
        if todo is None:
            return _not_connected_payload()
        folder = (
            todo.get_folder(folder_id=task_list_id)
            if task_list_id
            else todo.get_default_folder()
        )
        task = folder.get_task(object_id=task_id)

        if not task:
            return json.dumps({"provider": PROVIDER, "error": "Task not found"})

        return json.dumps(
            {
                "provider": PROVIDER,
                "id": task.object_id,
                "title": task.subject or "",
                "body": task.body or "",
                "due": task.due.isoformat() if task.due else "",
                "status": task.status or "",
                "importance": (str(task.importance) if task.importance else "normal"),
                "is_completed": task.is_completed,
                "completed_date": (
                    task.completed_date.isoformat() if getattr(task, "completed_date", None) else ""
                ),
            }
        )

    @tool(requires_confirmation=True)
    async def create_task(
        title: str,
        body: str = "",
        due_date: str = "",
        task_list_id: str = "",
    ) -> str:
        """Create a new task.

        Args:
            title: Task title.
            body: Task description/notes. Optional.
            due_date: Due date in ISO format (e.g. '2024-01-15'). Optional.
            task_list_id: Task list ID. Empty for the default list.
        """
        todo = await _get_todo()
        if todo is None:
            return _not_connected_payload()

        if task_list_id:
            folder = todo.get_folder(folder_id=task_list_id)
        else:
            folder = todo.get_default_folder()

        task = folder.new_task(title)

        if body:
            task.body = body
        if due_date:
            task.due = datetime.fromisoformat(due_date)

        ensure_ok(task.save(), action="the task-create request")

        return json.dumps(
            {
                "provider": PROVIDER,
                "status": "created",
                "id": task.object_id,
                "title": task.subject,
            }
        )

    @tool(requires_confirmation=True)
    async def update_task(
        task_id: str,
        title: str = "",
        body: str = "",
        due_date: str = "",
        task_list_id: str = "",
    ) -> str:
        """Update an existing task.

        Args:
            task_id: The task ID to update.
            title: New title. Optional.
            body: New description/notes. Optional.
            due_date: New due date in ISO format. Optional.
            task_list_id: Task list ID. Empty for the default list.
        """
        todo = await _get_todo()
        if todo is None:
            return _not_connected_payload()
        folder = (
            todo.get_folder(folder_id=task_list_id)
            if task_list_id
            else todo.get_default_folder()
        )
        task = folder.get_task(object_id=task_id)

        if not task:
            return json.dumps({"provider": PROVIDER, "error": "Task not found"})

        if title:
            task.subject = title
        if body:
            task.body = body
        if due_date:
            task.due = datetime.fromisoformat(due_date)

        ensure_ok(task.save(), action="the task-update request")

        return json.dumps(
            {"provider": PROVIDER, "status": "updated", "id": task.object_id}
        )

    @tool(requires_confirmation=True)
    async def complete_task(task_id: str, task_list_id: str = "") -> str:
        """Mark a task as completed.

        Args:
            task_id: The task ID to complete.
            task_list_id: Task list ID. Empty for the default list.
        """
        todo = await _get_todo()
        if todo is None:
            return _not_connected_payload()
        folder = (
            todo.get_folder(folder_id=task_list_id)
            if task_list_id
            else todo.get_default_folder()
        )
        task = folder.get_task(object_id=task_id)

        if not task:
            return json.dumps({"provider": PROVIDER, "error": "Task not found"})

        task.mark_completed()
        ensure_ok(task.save(), action="the task-complete request")

        return json.dumps(
            {
                "provider": PROVIDER,
                "status": "completed",
                "id": task.object_id,
                "title": task.subject,
            }
        )

    @tool(requires_confirmation=True)
    async def delete_task(task_id: str, task_list_id: str = "") -> str:
        """Delete a task.

        Args:
            task_id: The task ID to delete.
            task_list_id: Task list ID. Empty for the default list.
        """
        todo = await _get_todo()
        if todo is None:
            return _not_connected_payload()
        folder = (
            todo.get_folder(folder_id=task_list_id)
            if task_list_id
            else todo.get_default_folder()
        )
        task = folder.get_task(object_id=task_id)

        if not task:
            return json.dumps({"provider": PROVIDER, "error": "Task not found"})

        ensure_ok(task.delete(), action="the task-delete request")

        return json.dumps({"provider": PROVIDER, "status": "deleted", "id": task_id})

    return [
        list_task_lists,
        list_tasks,
        get_task,
        create_task,
        update_task,
        complete_task,
        delete_task,
    ]

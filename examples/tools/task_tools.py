"""Persistent task graph (DAG) stored under ``.tasks/`` as JSON — survives context compaction."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from examples.base import Tool, ToolResult


class TaskManager:
    """CRUD for a durable work graph on disk (not threads or worker slots)."""

    def __init__(self, tasks_dir: Path) -> None:
        self.dir = Path(tasks_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self._next_id = self._max_id() + 1

    def _max_id(self) -> int:
        ids: list[int] = []
        for f in self.dir.glob("task_*.json"):
            try:
                stem = f.stem.split("_", 1)[1]
                ids.append(int(stem))
            except (IndexError, ValueError):
                continue
        return max(ids) if ids else 0

    def _load(self, task_id: int) -> dict[str, Any]:
        path = self.dir / f"task_{task_id}.json"
        if not path.exists():
            msg = f"Task {task_id} not found"
            raise ValueError(msg)
        return json.loads(path.read_text(encoding="utf-8"))

    def _save(self, task: dict[str, Any]) -> None:
        path = self.dir / f"task_{task['id']}.json"
        path.write_text(json.dumps(task, indent=2), encoding="utf-8")

    def create(self, subject: str, description: str = "") -> str:
        task: dict[str, Any] = {
            "id": self._next_id,
            "subject": subject,
            "description": description,
            "status": "pending",
            "blockedBy": [],
            "blocks": [],
            "owner": "",
        }
        self._save(task)
        self._next_id += 1
        return json.dumps(task, indent=2)

    def get(self, task_id: int) -> str:
        return json.dumps(self._load(task_id), indent=2)

    def update(
        self,
        task_id: int,
        status: str | None = None,
        owner: str | None = None,
        add_blocked_by: list[int] | None = None,
        add_blocks: list[int] | None = None,
    ) -> str:
        task = self._load(task_id)
        if owner is not None:
            task["owner"] = owner
        if status:
            allowed = ("pending", "in_progress", "completed", "deleted")
            if status not in allowed:
                msg = f"Invalid status: {status}"
                raise ValueError(msg)
            task["status"] = status
            if status == "completed":
                self._clear_dependency(task_id)
        if add_blocked_by:
            task["blockedBy"] = list(set(task["blockedBy"] + add_blocked_by))
        if add_blocks:
            task["blocks"] = list(set(task["blocks"] + add_blocks))
            for blocked_id in add_blocks:
                try:
                    blocked = self._load(blocked_id)
                    if task_id not in blocked["blockedBy"]:
                        blocked["blockedBy"].append(task_id)
                        self._save(blocked)
                except ValueError:
                    pass
        self._save(task)
        return json.dumps(task, indent=2)

    def _clear_dependency(self, completed_id: int) -> None:
        for f in self.dir.glob("task_*.json"):
            other = json.loads(f.read_text(encoding="utf-8"))
            blocked_by = other.get("blockedBy", [])
            if completed_id in blocked_by:
                blocked_by.remove(completed_id)
                other["blockedBy"] = blocked_by
                self._save(other)

    def list_all(self) -> str:
        tasks: list[dict[str, Any]] = []
        for f in sorted(self.dir.glob("task_*.json")):
            tasks.append(json.loads(f.read_text(encoding="utf-8")))
        if not tasks:
            return "No tasks."
        marker = {
            "pending": "[ ]",
            "in_progress": "[>]",
            "completed": "[x]",
            "deleted": "[-]",
        }
        lines: list[str] = []
        for t in tasks:
            m = marker.get(t["status"], "[?]")
            blocked = f" (blocked by: {t['blockedBy']})" if t.get("blockedBy") else ""
            own = f" owner={t['owner']}" if t.get("owner") else ""
            lines.append(f"{m} #{t['id']}: {t['subject']}{own}{blocked}")
        return "\n".join(lines)


class TaskCreateTool(Tool):
    def __init__(self, tasks: TaskManager) -> None:
        self._tasks = tasks

    @property
    def name(self) -> str:
        return "task_create"

    @property
    def description(self) -> str:
        return (
            "Create a durable task under .tasks/ (work graph on disk). "
            "Use blockedBy / blocks via task_update to form a dependency DAG."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "subject": {"type": "string", "description": "Short title of the work item"},
                "description": {"type": "string", "description": "Optional detail"},
            },
            "required": ["subject"],
        }

    async def execute(self, *args: Any, **kwargs: Any) -> ToolResult:
        try:
            out = self._tasks.create(
                str(kwargs["subject"]).strip(),
                str(kwargs.get("description") or "").strip(),
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))
        return ToolResult(success=True, content=out)


class TaskUpdateTool(Tool):
    def __init__(self, tasks: TaskManager) -> None:
        self._tasks = tasks

    @property
    def name(self) -> str:
        return "task_update"

    @property
    def description(self) -> str:
        return (
            "Update task status, owner, or dependency edges (blockedBy / blocks). "
            "Completing a task removes it from other tasks' blockedBy lists."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer"},
                "status": {
                    "type": "string",
                    "enum": ["pending", "in_progress", "completed", "deleted"],
                },
                "owner": {
                    "type": "string",
                    "description": "Set when someone claims the task",
                },
                "addBlockedBy": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Task IDs that must complete before this one",
                },
                "addBlocks": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Task IDs unblocked after this one (adds reverse blockedBy links)",
                },
            },
            "required": ["task_id"],
        }

    async def execute(self, *args: Any, **kwargs: Any) -> ToolResult:
        add_b = kwargs.get("addBlockedBy")
        add_blk = kwargs.get("addBlocks")
        try:
            out = self._tasks.update(
                int(kwargs["task_id"]),
                kwargs.get("status"),
                kwargs.get("owner"),
                [int(x) for x in add_b] if add_b else None,
                [int(x) for x in add_blk] if add_blk else None,
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))
        return ToolResult(success=True, content=out)


class TaskListTool(Tool):
    def __init__(self, tasks: TaskManager) -> None:
        self._tasks = tasks

    @property
    def name(self) -> str:
        return "task_list"

    @property
    def description(self) -> str:
        return "List all tasks with status markers and blockedBy summary."

    @property
    def parameters(self) -> dict[str, Any]:
        return {"type": "object", "properties": {}}

    async def execute(self, *args: Any, **kwargs: Any) -> ToolResult:
        try:
            out = self._tasks.list_all()
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))
        return ToolResult(success=True, content=out)


class TaskGetTool(Tool):
    def __init__(self, tasks: TaskManager) -> None:
        self._tasks = tasks

    @property
    def name(self) -> str:
        return "task_get"

    @property
    def description(self) -> str:
        return "Get full JSON for one task by id (blockedBy, blocks, status, etc.)."

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {"task_id": {"type": "integer"}},
            "required": ["task_id"],
        }

    async def execute(self, *args: Any, **kwargs: Any) -> ToolResult:
        try:
            out = self._tasks.get(int(kwargs["task_id"]))
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))
        return ToolResult(success=True, content=out)

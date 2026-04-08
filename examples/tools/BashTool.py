import asyncio
import subprocess
import uuid
from pathlib import Path
from typing import Any

from examples.base import Tool, ToolResult
from examples.constants import PERSIST_MAX_CAPTURE_CHARS
from examples.utils import persist_large_output


class BashTool(Tool):
    def __init__(self, workdir: Path) -> None:
        self._workdir = workdir

    @property
    def name(self) -> str:
        return "bash"

    @property
    def description(self) -> str:
        return "Run a shell command."

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {"command": {"type": "string"}},
            "required": ["command"],
        }

    def _run_sync(self, command: str) -> str:
        dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"]
        if any(d in command for d in dangerous):
            return "Error: Dangerous command blocked"
        try:
            r = subprocess.run(
                command,
                shell=True,
                cwd=self._workdir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=120,
            )
            out = ((r.stdout or "") + (r.stderr or "")).strip()
            if not out:
                return "(no output)"
            if len(out) > PERSIST_MAX_CAPTURE_CHARS:
                out = (
                    out[:PERSIST_MAX_CAPTURE_CHARS]
                    + "\n\n[output truncated before persistence due to size]"
                )
            return out
        except subprocess.TimeoutExpired:
            return "Error: Timeout (120s)"

    async def execute(self, *args: Any, **kwargs: Any) -> ToolResult:
        content = await asyncio.to_thread(self._run_sync, kwargs["command"])
        tool_use_id = str(kwargs.get("tool_use_id") or uuid.uuid4().hex)
        content = persist_large_output(tool_use_id, content)
        return ToolResult(success=True, content=content)

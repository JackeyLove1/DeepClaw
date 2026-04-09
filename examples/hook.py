#!/usr/bin/env python3
# Harness: extensibility -- injecting behavior without touching the loop.
"""
Hook System

Hooks are extension points around the main loop.
They let readers add behavior without rewriting the loop itself.

Teaching version:
  - SessionStart
  - PreToolUse
  - PostToolUse

Teaching exit-code contract:
  - 0 -> continue
  - 1 -> block
  - 2 -> inject a message

This is intentionally simpler than a production system. The goal here is to
teach the extension pattern clearly before introducing event-specific edge
cases.

Key insight: "Extend the agent without touching the loop."
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from examples.constants import HOOK_ENV_PAYLOAD_MAX_CHARS, HOOK_TIMEOUT

HOOK_EVENTS = ("PreToolUse", "PostToolUse", "SessionStart")

# Workspace trust marker. Hooks only run if this file exists (or SDK mode).
_TRUST_REL = Path(".claude") / ".claude_trusted"


class HookManager:
    """
    Load and execute hooks from .hooks.json configuration.

    The hook manager does three simple jobs:
    - load hook definitions
    - run matching commands for an event
    - aggregate block / message results for the caller
    """

    def __init__(
        self,
        workdir: Path,
        config_path: Path | None = None,
        sdk_mode: bool = False,
    ) -> None:
        self._workdir = Path(workdir).resolve()
        self.hooks: dict[str, list] = {
            "PreToolUse": [],
            "PostToolUse": [],
            "SessionStart": [],
        }
        self._sdk_mode = sdk_mode
        cfg = config_path or (self._workdir / ".hooks.json")
        if cfg.exists():
            try:
                config = json.loads(cfg.read_text(encoding="utf-8"))
                for event in HOOK_EVENTS:
                    self.hooks[event] = config.get("hooks", {}).get(event, [])
                print(f"[Hooks loaded from {cfg}]")
            except Exception as e:
                print(f"[Hook config error: {e}]")

    @property
    def trust_marker(self) -> Path:
        return self._workdir / _TRUST_REL

    def _check_workspace_trust(self) -> bool:
        if self._sdk_mode:
            return True
        return self.trust_marker.exists()

    def run_hooks(self, event: str, context: dict | None = None) -> dict:
        """
        Execute all hooks for an event.

        Returns: {"blocked": bool, "messages": list[str]}
          - blocked: True if any hook returned exit code 1
          - messages: stderr content from exit-code-2 hooks (to inject)
        """
        result: dict = {"blocked": False, "messages": []}

        if not self._check_workspace_trust():
            return result

        hooks = self.hooks.get(event, [])

        for hook_def in hooks:
            matcher = hook_def.get("matcher")
            if matcher and context:
                tool_name = context.get("tool_name", "")
                if matcher != "*" and matcher != tool_name:
                    continue

            command = hook_def.get("command", "")
            if not command:
                continue

            env = dict(os.environ)
            if context:
                tool_input = context.get("tool_input", {})
                env["HOOK_EVENT"] = event
                env["HOOK_TOOL_NAME"] = context.get("tool_name", "")
                env["HOOK_TOOL_INPUT"] = json.dumps(
                    tool_input, ensure_ascii=False
                )[:HOOK_ENV_PAYLOAD_MAX_CHARS]
                if "tool_output" in context:
                    env["HOOK_TOOL_OUTPUT"] = str(context["tool_output"])[
                        :HOOK_ENV_PAYLOAD_MAX_CHARS
                    ]

            try:
                r = subprocess.run(
                    command,
                    shell=True,
                    cwd=self._workdir,
                    env=env,
                    capture_output=True,
                    text=True,
                    timeout=HOOK_TIMEOUT,
                )

                if r.returncode == 0:
                    if r.stdout.strip():
                        print(f"  [hook:{event}] {r.stdout.strip()[:100]}")

                    try:
                        hook_output = json.loads(r.stdout)
                        if "updatedInput" in hook_output and context:
                            context["tool_input"] = hook_output["updatedInput"]
                        if "additionalContext" in hook_output:
                            result["messages"].append(
                                str(hook_output["additionalContext"])
                            )
                        if "permissionDecision" in hook_output:
                            result["permission_override"] = hook_output[
                                "permissionDecision"
                            ]
                    except (json.JSONDecodeError, TypeError):
                        pass

                elif r.returncode == 1:
                    result["blocked"] = True
                    reason = r.stderr.strip() or "Blocked by hook"
                    result["block_reason"] = reason
                    print(f"  [hook:{event}] BLOCKED: {reason[:200]}")

                elif r.returncode == 2:
                    msg = r.stderr.strip()
                    if msg:
                        result["messages"].append(msg)
                        print(f"  [hook:{event}] INJECT: {msg[:200]}")

            except subprocess.TimeoutExpired:
                print(f"  [hook:{event}] Timeout ({HOOK_TIMEOUT}s)")
            except Exception as e:
                print(f"  [hook:{event}] Error: {e}")

        return result

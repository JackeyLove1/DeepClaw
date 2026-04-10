"""JSON Schema validation for tool inputs (Anthropic-style `Tool.parameters`)."""

from __future__ import annotations

from typing import Any

from jsonschema import ValidationError
from jsonschema.validators import validator_for

from examples.base import Tool

_tool_input_validators: dict[str, Any] = {}


def clear_tool_input_validator_cache() -> None:
    """Drop cached validators (e.g. after MCP tools are re-registered)."""
    _tool_input_validators.clear()


def _get_tool_input_validator(tool: Tool) -> Any:
    name = tool.name
    if name not in _tool_input_validators:
        schema = tool.parameters
        cls = validator_for(schema)
        _tool_input_validators[name] = cls(schema)
    return _tool_input_validators[name]


def _format_validation_error(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        path = ".".join(str(p) for p in exc.path) if exc.path else "root"
        return f"Error: tool input JSON schema validation failed at {path!r}: {exc.message}"
    return f"Error: tool input JSON schema validation failed: {exc!s}"


def validate_tool_input(agent_tool: Tool | None, inp: dict[str, Any]) -> str | None:
    """
    Validate `inp` against `agent_tool.parameters`.

    Returns an error string for the tool_result, or None if validation passes or
    `agent_tool` is missing (unknown tool — caller handles that separately).
    """
    if agent_tool is None:
        return None
    try:
        _get_tool_input_validator(agent_tool).validate(inp)
    except Exception as e:
        return _format_validation_error(e)
    return None

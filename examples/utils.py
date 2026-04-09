import json
import platform
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from examples.constants import MAX_MODEL_CONTENT_TOKENS, PERSIST_THRESHOLD, PREVIEW_CHARS


def get_platform() -> str:
    return platform.system().lower()


def get_timestamp() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


@lru_cache
def get_work_dir(file_path: str | Path | None = None) -> Path:
    if file_path is None:
        return Path(__file__).resolve().parent
    return Path(file_path).resolve().parent


@lru_cache
def get_skill_dir() -> Path:
    return get_work_dir() / "skills"


@lru_cache
def get_tool_result_dir() -> Path:
    return get_work_dir() / "tool_results"


@lru_cache
def get_transcription_dir() -> Path:
    return get_work_dir() / "transcriptions"


def _get_message_field(message: Any, field_name: str) -> Any:
    if isinstance(message, dict):
        return message.get(field_name)
    return getattr(message, field_name, None)


def _message_extras(message: Any) -> Any:
    known_fields = {"role", "content", "thinking", "tool_calls", "name", "tool_use_id"}
    if isinstance(message, dict):
        return {k: v for k, v in message.items() if k not in known_fields}
    if hasattr(message, "__dict__"):
        return {k: v for k, v in vars(message).items() if k not in known_fields}
    return None


def _value_to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, dict):
        try:
            return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
        except TypeError:
            return str(value)
    if isinstance(value, (list, tuple, set)):
        return "\n".join(_value_to_text(item) for item in value)
    if hasattr(value, "text") and isinstance(value.text, str):
        parts = [value.text]
        for attr in ("name", "id", "type", "thinking", "input"):
            attr_value = getattr(value, attr, None)
            if attr_value is not None:
                parts.append(_value_to_text(attr_value))
        return "\n".join(part for part in parts if part)
    if hasattr(value, "__dict__"):
        return _value_to_text(vars(value))
    return str(value)


def _estimate_tokens_fallback(messages: list) -> int:
    """Fallback estimation when tiktoken is unavailable."""
    total_chars = 0
    for message in messages:
        total_chars += len(_value_to_text(_get_message_field(message, "role")))
        total_chars += len(_value_to_text(_get_message_field(message, "content")))
        total_chars += len(_value_to_text(_get_message_field(message, "thinking")))
        total_chars += len(_value_to_text(_get_message_field(message, "tool_calls")))
        total_chars += len(_value_to_text(_get_message_field(message, "name")))
        total_chars += len(_value_to_text(_get_message_field(message, "tool_use_id")))
        total_chars += len(_value_to_text(_message_extras(message)))
        total_chars += 16
    return max(1, int(total_chars / 3.5))


def estimate_tokens(messages: list) -> int:
    """Estimate token count for anthrophic message history."""
    try:
        import tiktoken

        encoding = tiktoken.get_encoding("cl100k_base")
    except Exception:
        return _estimate_tokens_fallback(messages)

    total_tokens = 0
    for message in messages:
        total_tokens += len(encoding.encode(_value_to_text(_get_message_field(message, "role"))))
        total_tokens += len(encoding.encode(_value_to_text(_get_message_field(message, "content"))))
        total_tokens += len(
            encoding.encode(_value_to_text(_get_message_field(message, "thinking")))
        )
        total_tokens += len(
            encoding.encode(_value_to_text(_get_message_field(message, "tool_calls")))
        )
        total_tokens += len(encoding.encode(_value_to_text(_get_message_field(message, "name"))))
        total_tokens += len(
            encoding.encode(_value_to_text(_get_message_field(message, "tool_use_id")))
        )
        total_tokens += len(encoding.encode(_value_to_text(_message_extras(message))))
        total_tokens += 4
    return total_tokens


def estimate_context_usage(
    messages: list,
    max_context_tokens: int = MAX_MODEL_CONTENT_TOKENS,
) -> dict[str, int | float]:
    """Return a quick context-usage summary for agent7 messages."""
    estimated_tokens = estimate_tokens(messages)
    remaining_tokens = max(0, max_context_tokens - estimated_tokens)
    usage_ratio = estimated_tokens / max_context_tokens if max_context_tokens else 0.0
    return {
        "estimated_tokens": estimated_tokens,
        "max_context_tokens": max_context_tokens,
        "remaining_tokens": remaining_tokens,
        "usage_ratio": usage_ratio,
        "usage_percent": round(usage_ratio * 100, 2),
    }


def persist_large_output(tool_use_id: str, output: str) -> str:
    if len(output) <= PERSIST_THRESHOLD:
        return output

    WORKDIR = get_work_dir()
    TOOL_RESULTS_DIR = get_tool_result_dir()

    TOOL_RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    stored_path = TOOL_RESULTS_DIR / f"{tool_use_id}.txt"
    if not stored_path.exists():
        stored_path.write_text(output)

    preview = output[:PREVIEW_CHARS]
    rel_path = stored_path.relative_to(WORKDIR)
    return (
        "<persisted-output>\n"
        f"Full output saved to: {rel_path}\n"
        "Preview:\n"
        f"{preview}\n"
        "</persisted-output>"
    )

"""Agent compaction."""

from __future__ import annotations

import hashlib
import json
from importlib.resources import files as pkg_files
from pathlib import Path
from typing import Any

from loguru import logger

from winclaw.providers.base import LLMProvider
from winclaw.utils.helpers import get_prompt_path
from winclaw.utils.typing import MessageListType, Role

_AUTO_COMPACTION_TRIGGER_RATIO = 0.9
_COMPACTION_PREFIX = "[Compacted conversation summary]"


def _estimate_content_chars(value: Any) -> int:
    """Estimate character size for nested message content."""
    if value is None:
        return 0
    if isinstance(value, str):
        return len(value)
    if isinstance(value, list):
        return sum(_estimate_content_chars(item) for item in value)
    if isinstance(value, dict):
        return sum(_estimate_content_chars(item) for item in value.values())
    return len(str(value))


def _extract_tool_name(tool_call: Any) -> str | None:
    """Extract tool name from a stored tool call payload."""
    if not isinstance(tool_call, dict):
        return None
    function_data = tool_call.get("function")
    if isinstance(function_data, dict) and isinstance(function_data.get("name"), str):
        return function_data["name"]
    if isinstance(tool_call.get("name"), str):
        return tool_call["name"]
    return None


def _tool_name_by_call_id(messages: MessageListType) -> dict[str, str]:
    """Build a tool_call_id -> tool_name lookup table."""
    mapping: dict[str, str] = {}
    for msg in messages:
        if msg.get("role") != Role.ASSISTANT.value:
            continue
        for tool_call in msg.get("tool_calls") or []:
            if not isinstance(tool_call, dict):
                continue
            tool_call_id = tool_call.get("id")
            tool_name = _extract_tool_name(tool_call)
            if isinstance(tool_call_id, str) and tool_name:
                mapping[tool_call_id] = tool_name
    return mapping


def _tool_placeholder(tool_name: str | None) -> str:
    """Create a compact placeholder for older tool output."""
    if tool_name:
        return f"[Compacted tool result from {tool_name}; original output omitted.]"
    return "[Compacted tool result; original output omitted.]"


def _summary_cache_key(messages: MessageListType) -> str:
    """Create a stable cache key for the compactable history slice."""
    payload = json.dumps(messages, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def _find_compactable_split(messages: MessageListType) -> int | None:
    """Return the index of the latest user message to preserve in full."""
    for index in range(len(messages) - 1, 0, -1):
        if messages[index].get("role") == Role.USER.value:
            return index if index > 1 else None
    return None


def _load_compact_prompt(workspace: Path | None = None) -> str:
    """Load the compaction prompt from workspace/data-dir/package fallback paths."""
    candidates: list[Path] = []
    if workspace is not None:
        candidates.append(workspace / "prompts" / "compact.md")
    candidates.append(get_prompt_path() / "compact.md")
    candidates.append(Path(pkg_files("winclaw") / "templates" / "prompts" / "compact.md"))

    for candidate in candidates:
        if candidate.exists():
            return candidate.read_text(encoding="utf-8")
    raise FileNotFoundError("compact.md prompt not found")


def estimate_tokens(messages: MessageListType) -> int:
    """Estimate tokens conservatively using ~4 chars/token across request fields."""
    total_chars = 0
    for msg in messages:
        total_chars += _estimate_content_chars(msg.get("content"))
        total_chars += _estimate_content_chars(msg.get("tool_calls"))
        # total_chars += _estimate_content_chars(msg.get("reasoning_content"))
        # total_chars += _estimate_content_chars(msg.get("name"))
    return max(1, total_chars // 4)


def micro_compaction(
    messages: MessageListType,
    max_tool_keep_count: int = 10,
) -> MessageListType:
    """Replace older tool results with short placeholders."""
    tool_results = [
        idx
        for idx, msg in enumerate(messages)
        if msg.get("role") == Role.TOOL.value and isinstance(msg.get("content"), str)
    ]
    if len(tool_results) <= max_tool_keep_count:
        logger.debug(
            "Micro-compaction skipped: tool_results={} keep_limit={}",
            len(tool_results),
            max_tool_keep_count,
        )
        return messages

    tool_name_map = _tool_name_by_call_id(messages)
    compacted = [dict(msg) for msg in messages]
    replaced_count = 0
    for msg_idx in tool_results[:-max_tool_keep_count]:
        tool_call_id = compacted[msg_idx].get("tool_call_id")
        tool_name = tool_name_map.get(tool_call_id) if isinstance(tool_call_id, str) else None
        compacted[msg_idx]["content"] = _tool_placeholder(tool_name)
        replaced_count += 1
    logger.info(
        "Micro-compaction replaced {} tool result(s); kept latest {}",
        replaced_count,
        max_tool_keep_count,
    )
    return compacted


async def auto_compaction(
    messages: MessageListType,
    provider: LLMProvider,
    model: str,
    max_tokens: int,
    *,
    workspace: Path | None = None,
    summary_cache: dict[str, str] | None = None,
) -> MessageListType:
    """Compact older conversation history into a single summary message."""
    compacted = micro_compaction(messages)
    split_index = _find_compactable_split(compacted)
    if split_index is None:
        logger.debug("Auto-compaction skipped: no compactable history before latest user turn")
        return compacted

    history_to_compact = compacted[1:split_index]
    if not history_to_compact:
        logger.debug("Auto-compaction skipped: compactable history slice is empty")
        return compacted

    if (
        len(history_to_compact) == 1
        and history_to_compact[0].get("role") == Role.ASSISTANT.value
        and isinstance(history_to_compact[0].get("content"), str)
        and history_to_compact[0]["content"].startswith(_COMPACTION_PREFIX)
    ):
        logger.debug("Auto-compaction skipped: history already compacted")
        return compacted

    cache_key = _summary_cache_key(history_to_compact)
    summary = summary_cache.get(cache_key) if summary_cache is not None else None

    logger.info(
        "Auto-compaction started: compacting {} message(s) before current turn",
        len(history_to_compact),
    )
    if summary is None:
        logger.debug("Auto-compaction cache miss: key={}", cache_key[:12])
        compact_prompt = _load_compact_prompt(workspace)
        response = await provider.chat(
            messages=[
                {"role": "system", "content": compact_prompt},
                {
                    "role": "user",
                    "content": json.dumps(
                        history_to_compact, ensure_ascii=False, indent=2, default=str
                    ),
                },
            ],
            model=model,
            max_tokens=max(256, min(max_tokens // 2, 2048)),
            temperature=0.1,
        )
        summary = (response.content or "").strip()
        if response.finish_reason == "error" or not summary:
            logger.warning("Auto-compaction failed; falling back to micro compaction")
            return compacted
        if summary_cache is not None:
            summary_cache[cache_key] = summary
            logger.debug("Auto-compaction cached summary: key={}", cache_key[:12])
    else:
        logger.debug("Auto-compaction cache hit: key={}", cache_key[:12])

    raw_history_len = len(json.dumps(history_to_compact, ensure_ascii=False, default=str))
    if len(summary) >= raw_history_len:
        logger.debug("Skipping auto-compaction because summary is not smaller")
        return compacted

    logger.info(
        "Auto-compaction succeeded: {} chars -> {} chars",
        raw_history_len,
        len(summary),
    )
    return [
        compacted[0],
        {"role": Role.ASSISTANT.value, "content": f"{_COMPACTION_PREFIX}\n{summary}"},
        *compacted[split_index:],
    ]


async def compact_messages(
    messages: MessageListType,
    provider: LLMProvider,
    model: str,
    max_tokens: int,
    *,
    workspace: Path | None = None,
    trigger_ratio: float = _AUTO_COMPACTION_TRIGGER_RATIO,
    summary_cache: dict[str, str] | None = None,
) -> MessageListType:
    """Apply micro compaction first, then LLM-based compaction when near the limit."""
    compacted = micro_compaction(messages)
    estimated_tokens = estimate_tokens(compacted)
    trigger_tokens = max(1, int(max_tokens * trigger_ratio))
    if estimated_tokens < trigger_tokens:
        logger.debug(
            "Compaction skipped: estimated_tokens={} trigger_tokens={}",
            estimated_tokens,
            trigger_tokens,
        )
        return compacted

    logger.info(
        "Triggering auto-compaction: estimated_tokens={}, trigger_tokens={}",
        estimated_tokens,
        trigger_tokens,
    )
    return await auto_compaction(
        compacted,
        provider,
        model,
        max_tokens,
        workspace=workspace,
        summary_cache=summary_cache,
    )


def manual_compaction(messages: MessageListType) -> MessageListType:
    """Placeholder for future manual compaction support."""
    return messages

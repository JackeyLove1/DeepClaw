"""
replace old tool call result to [Compacted tool result from {tool_name}; original output omitted.]
"""

from examples.constants import (
    KEEP_RECENT_TOOL_RESULTS,
    MICRO_COMPACTION_TRIGGER_TOKENS,
    SHORT_TOOL_RESULT_CHAR_LIMIT,
)
from examples.utils import estimate_tokens


def _collect_tool_result_blocks(messages: list) -> list[tuple[int, int, dict]]:
    blocks = []
    for message_index, message in enumerate(messages):
        content = message.get("content")
        if message.get("role") != "user" or not isinstance(content, list):
            continue
        for block_index, block in enumerate(content):
            if isinstance(block, dict) and block.get("type") == "tool_result":
                blocks.append((message_index, block_index, block))
    return blocks


def micro_compact(messages: list) -> list:
    total_tokens = estimate_tokens(messages)
    if total_tokens < MICRO_COMPACTION_TRIGGER_TOKENS:
        return messages
    tool_results = _collect_tool_result_blocks(messages)
    if len(tool_results) <= KEEP_RECENT_TOOL_RESULTS:
        return messages

    for _, _, block in tool_results[:-KEEP_RECENT_TOOL_RESULTS]:
        content = block.get("content", "")
        if not isinstance(content, str) or len(content) <= SHORT_TOOL_RESULT_CHAR_LIMIT:
            continue
        block["content"] = (
            "[Earlier tool result compacted. Re-run the tool if you need full detail.]"
        )
    return messages

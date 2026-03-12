from __future__ import annotations

import pytest

from winclaw.agent.compact import compact_messages, estimate_tokens, micro_compaction
from winclaw.providers.base import LLMProvider, LLMResponse


class FakeProvider(LLMProvider):
    def __init__(self, summary: str) -> None:
        super().__init__()
        self.summary = summary
        self.calls = 0

    async def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        reasoning_effort: str | None = None,
    ) -> LLMResponse:
        self.calls += 1
        return LLMResponse(content=self.summary)

    def get_default_model(self) -> str:
        return "fake"


def test_estimate_tokens_counts_nested_message_content() -> None:
    messages = [
        {"role": "system", "content": "sys"},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "hello"},
                {"type": "text", "text": "world"},
            ],
        },
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {"name": "echo", "arguments": '{"text":"payload"}'},
                }
            ],
        },
    ]

    assert estimate_tokens(messages) >= 6


def test_micro_compaction_replaces_only_older_tool_results() -> None:
    messages = [
        {"role": "system", "content": "sys"},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [{"id": "1", "type": "function", "function": {"name": "alpha"}}],
        },
        {"role": "tool", "tool_call_id": "1", "name": "alpha", "content": "result-1"},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [{"id": "2", "type": "function", "function": {"name": "beta"}}],
        },
        {"role": "tool", "tool_call_id": "2", "name": "beta", "content": "result-2"},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [{"id": "3", "type": "function", "function": {"name": "gamma"}}],
        },
        {"role": "tool", "tool_call_id": "3", "name": "gamma", "content": "result-3"},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [{"id": "4", "type": "function", "function": {"name": "delta"}}],
        },
        {"role": "tool", "tool_call_id": "4", "name": "delta", "content": "result-4"},
    ]

    compacted = micro_compaction(messages, max_tool_keep_count=2)

    assert compacted[2]["content"] == "[Compacted tool result from alpha; original output omitted.]"
    assert compacted[4]["content"] == "[Compacted tool result from beta; original output omitted.]"
    assert compacted[6]["content"] == "result-3"
    assert compacted[8]["content"] == "result-4"


@pytest.mark.asyncio
async def test_compact_messages_caches_summary_and_keeps_current_turn() -> None:
    provider = FakeProvider(
        "<current_focus>Current task</current_focus>\n<completed_tasks></completed_tasks>"
    )
    summary_cache: dict[str, str] = {}
    messages = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "A" * 400},
        {"role": "assistant", "content": "B" * 400},
        {"role": "user", "content": "continue current task"},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "call_live",
                    "type": "function",
                    "function": {"name": "exec", "arguments": "{}"},
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call_live",
            "name": "exec",
            "content": "live tool output",
        },
    ]

    compacted = await compact_messages(
        messages,
        provider=provider,
        model="fake",
        max_tokens=100,
        summary_cache=summary_cache,
    )
    compacted_again = await compact_messages(
        messages,
        provider=provider,
        model="fake",
        max_tokens=100,
        summary_cache=summary_cache,
    )

    assert provider.calls == 1
    assert compacted[0] == messages[0]
    assert compacted[1]["role"] == "assistant"
    assert compacted[1]["content"].startswith("[Compacted conversation summary]")
    assert compacted[2:] == messages[3:]
    assert compacted_again == compacted

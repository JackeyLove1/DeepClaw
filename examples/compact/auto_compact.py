"""
session compaction
"""

import json
import time
from pathlib import Path
from typing import Any

from anthropic import Anthropic

from examples.compact.prompt import BASE_COMPACT_PROMPT
from examples.utils import get_transcription_dir, get_work_dir

_SESSION_SUMMARY_MAX_TOKENS = 4000
_DEFAULT_ANALYSIS_INSTRUCTION = (
    "Focus on preserving concrete user requests, code changes, tool outputs worth keeping, "
    "open problems, and the exact next implementation step."
)


def _response_text(blocks: list[Any]) -> str:
    text_parts = []
    for block in blocks:
        text = getattr(block, "text", None)
        if text:
            text_parts.append(text)
    return "".join(text_parts).strip()


def _serialize_messages(messages: list) -> str:
    return json.dumps(messages, ensure_ascii=False, indent=2, default=str)


def _compact_prompt() -> str:
    return BASE_COMPACT_PROMPT.format(
        detailed_analysis_instruction_base=_DEFAULT_ANALYSIS_INSTRUCTION
    )


def write_transcript(messages: list) -> Path:
    transcript_dir = get_transcription_dir()
    transcript_dir.mkdir(parents=True, exist_ok=True)
    path = transcript_dir / f"transcript_{int(time.time())}.jsonl"
    with path.open("w", encoding="utf-8") as f:
        for message in messages:
            f.write(json.dumps(message, ensure_ascii=False, default=str) + "\n")
    return path


def summarize_history(
    messages: list,
    client: Anthropic,
    model: str,
    focus: str | None = None,
) -> str:
    conversation = _serialize_messages(messages)
    user_content = (
        "Please compact this conversation history for continued agent execution.\n\n"
        "Conversation history:\n"
        f"{conversation}"
    )
    if focus:
        user_content += f"\n\nFocus to preserve:\n{focus}"

    response = client.messages.create(
        model=model,
        system=_compact_prompt(),
        messages=[{"role": "user", "content": user_content}],
        max_tokens=_SESSION_SUMMARY_MAX_TOKENS,
    )
    return _response_text(response.content)


def summary_messages(
    messages: list,
    client: Anthropic,
    model: str,
    focus: str | None = None,
) -> list:
    transcript_path = write_transcript(messages)
    workdir = get_work_dir()
    try:
        display_path = transcript_path.relative_to(workdir)
    except ValueError:
        display_path = transcript_path

    print(f"[session compact transcript saved: {display_path}]")
    summary = summarize_history(messages, client=client, model=model, focus=focus)

    return [
        {
            "role": "user",
            "content": (
                "The earlier conversation was session-compacted so work can continue "
                "within the context window.\n"
                f"Transcript saved to: {display_path}\n\n"
                f"{summary}"
            ),
        }
    ]

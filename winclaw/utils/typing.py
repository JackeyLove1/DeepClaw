from __future__ import annotations

from enum import Enum
from typing import Any

type JsonType = None | int | float | str | bool | list[JsonType] | dict[str, JsonType]

type MessageListType = list[dict[str, Any]]


class Role(Enum):
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"
    SYSTEM = "system"

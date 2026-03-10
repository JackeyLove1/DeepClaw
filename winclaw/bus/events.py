"""Event types for the message bus."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, List, Optional


@dataclass
class InboundMessage:
    """Message received from a chat channel."""

    channel: str  # telegram, discord, slack, whatsapp
    sender_id: str  # User identifier
    chat_id: str  # Chat/channel identifier
    content: str  # Message text
    timestamp: datetime = field(default_factory=datetime.now)
    media: List[str] = field(default_factory=list)  # Media URLs
    metadata: dict[str, Any] = field(default_factory=dict)  # Channel-specific data
    session_key_override: Optional[str] = None  # Optional override for thread-scoped sessions
    session_id: Optional[str] = None

    @property
    def session_key(self) -> str:
        """Unique key for session identification."""
        return self.session_key_override or f"{self.channel}:{self.chat_id}"

    @property
    def session_id(self) -> str:
        """Unique ID for session identification."""
        return self.session_id


@dataclass
class OutboundMessage:
    """Message to send to a chat channel."""

    channel: str
    chat_id: str
    content: str
    reply_to: Optional[str] = None
    media: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    session_id: Optional[str] = None

    @property
    def session_id(self) -> str:
        """Unique ID for session identification."""
        return self.session_id

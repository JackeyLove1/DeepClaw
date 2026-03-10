"""Message bus module for decoupled channel-agent communication."""

from winclaw.bus.events import InboundMessage, OutboundMessage

__all__ = ["InboundMessage", "OutboundMessage"]

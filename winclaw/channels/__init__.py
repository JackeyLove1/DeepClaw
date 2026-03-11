"""Chat channels module with plugin architecture."""

from winclaw.channels.base import BaseChannel
from winclaw.channels.manager import ChannelManager

__all__ = ["BaseChannel", "ChannelManager"]

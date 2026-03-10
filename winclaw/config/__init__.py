"""Configuration module for winclaw."""

from winclaw.config.loader import get_config_path, load_config
from winclaw.config.schema import Config

__all__ = ["Config", "load_config", "get_config_path"]

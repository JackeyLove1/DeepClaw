"""Configuration loading utilities."""

import json
from pathlib import Path

from winclaw.config.schema import Config


def get_config_path() -> Path:
    """Get the default configuration file path."""
    return Path.home() / ".winclaw" / "config.json"


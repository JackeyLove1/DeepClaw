# pylint: disable=protected-access

from pathlib import Path

from winclaw.cli import commands
from winclaw.config.loader import load_config, save_config
from winclaw.config.schema import Config


def test_run_cli_startup_syncs_workspace_and_optional_bin(monkeypatch, tmp_path):
    calls: list[tuple[str, Path]] = []

    monkeypatch.setattr(
        commands,
        "sync_workspace_templates",
        lambda workspace=None: calls.append(("templates", workspace)),
    )
    monkeypatch.setattr(
        commands,
        "sync_bin_tools",
        lambda workspace=None: calls.append(("bin", workspace)),
    )

    commands._run_cli_startup(workspace=tmp_path, sync_bin=False)
    assert calls == [("templates", tmp_path)]

    calls.clear()
    commands._run_cli_startup(workspace=tmp_path, sync_bin=True)
    assert calls == [("templates", tmp_path), ("bin", tmp_path)]


def test_load_cli_config_creates_default_config_when_missing(monkeypatch, tmp_path):
    config_path = tmp_path / "config.json"
    workspace = tmp_path / "workspace"
    startup_calls: list[tuple[Path, bool]] = []

    monkeypatch.setattr("winclaw.config.loader.get_config_path", lambda: config_path)
    monkeypatch.setattr(
        commands,
        "_run_cli_startup",
        lambda *, workspace=None, sync_bin=False: startup_calls.append((workspace, sync_bin)),
    )

    config = commands._load_cli_config(workspace=str(workspace), sync_bin=True)

    assert config_path.exists()
    assert config.agents.defaults.workspace == str(workspace)
    assert startup_calls == [(workspace, True)]

    saved_config = load_config(config_path)
    assert saved_config.agents.defaults.workspace == str(workspace)


def test_load_cli_config_skips_save_when_config_exists(monkeypatch, tmp_path):
    config_path = tmp_path / "config.json"
    existing_workspace = tmp_path / "existing-workspace"
    existing = Config.model_validate({"agents": {"defaults": {"workspace": str(existing_workspace)}}})
    save_config(existing, config_path)

    monkeypatch.setattr("winclaw.config.loader.get_config_path", lambda: config_path)
    monkeypatch.setattr(commands, "_run_cli_startup", lambda **kwargs: None)

    def fail_save(*args, **kwargs):
        raise AssertionError("save_config should not be called for existing config")

    monkeypatch.setattr("winclaw.config.loader.save_config", fail_save)

    config = commands._load_cli_config()

    assert config.agents.defaults.workspace == str(existing_workspace)

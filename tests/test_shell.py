import asyncio

import pytest

from winclaw.tools.shell import ExecTool


class MockProcess:
    def __init__(self, stdout: bytes = b"", stderr: bytes = b"", returncode: int = 0):
        self._stdout = stdout
        self._stderr = stderr
        self.returncode = returncode
        self.killed = False
        self.wait_called = False

    async def communicate(self):
        return self._stdout, self._stderr

    async def wait(self):
        self.wait_called = True
        return self.returncode

    def kill(self):
        self.killed = True


@pytest.mark.asyncio
async def test_exec_tool_runs_command_via_powershell(monkeypatch, tmp_path):
    calls = {}

    async def fake_create_subprocess_exec(*args, **kwargs):
        calls["args"] = args
        calls["kwargs"] = kwargs
        return MockProcess(stdout=b"Desktop\r\n")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    tool = ExecTool(working_dir=str(tmp_path))
    result = await tool.execute('Get-ChildItem -Path "$env:USERPROFILE\\Desktop"')

    assert result == "Desktop\r\n"
    assert calls["args"] == (
        "powershell.exe",
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        'Get-ChildItem -Path "$env:USERPROFILE\\Desktop"',
    )
    assert calls["kwargs"]["cwd"] == str(tmp_path)
    assert calls["kwargs"]["stdout"] is asyncio.subprocess.PIPE
    assert calls["kwargs"]["stderr"] is asyncio.subprocess.PIPE

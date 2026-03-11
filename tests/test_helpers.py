import threading
import time
from pathlib import Path

from winclaw.utils.helpers import _sync_missing_dir


def test_sync_missing_dir_collects_then_copies_in_parallel(tmp_path):
    src = tmp_path / "src"
    dest = tmp_path / "dest"
    src.mkdir()
    dest.mkdir()

    expected: list[str] = []
    for index in range(6):
        rel_path = Path("nested", f"file-{index}.txt")
        file_path = src / rel_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(f"payload-{index}", encoding="utf-8")
        expected.append(str(rel_path))

    lock = threading.Lock()
    active = 0
    max_active = 0

    def copy_file(src_path: Path, dest_path: Path) -> None:
        nonlocal active, max_active
        with lock:
            active += 1
            max_active = max(max_active, active)
        time.sleep(0.05)
        dest_path.write_text(src_path.read_text(encoding="utf-8"), encoding="utf-8")
        with lock:
            active -= 1

    added = _sync_missing_dir(
        src,
        dest,
        relative_to=dest,
        copy_file=copy_file,
    )

    assert added == expected
    assert max_active > 1
    for rel_path in expected:
        assert (dest / rel_path).read_text(encoding="utf-8").startswith("payload-")

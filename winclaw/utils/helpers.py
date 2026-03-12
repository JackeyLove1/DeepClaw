import re
import shutil
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from importlib.resources import as_file
from importlib.resources import files as pkg_files
from pathlib import Path

from loguru import logger


def detect_image_mime(data: bytes) -> str | None:
    """Detect image MIME type from magic bytes, ignoring file extension."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def ensure_dir(path: Path) -> Path:
    if not path.exists():
        logger.info(f"Creating directory: {path}")
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_data_path() -> Path:
    """~/.winclaw data directory."""
    return ensure_dir(Path.home() / ".winclaw")


def get_workspace_path() -> Path:
    """Resolve and ensure workspace path. Defaults to ~/.winclaw."""
    path = Path.home() / ".winclaw"
    return ensure_dir(path)


def get_temp_path() -> Path:
    return ensure_dir(get_data_path() / "tmp")


def get_prompt_path() -> Path:
    return ensure_dir(get_data_path() / "prompts")


def get_memory_path() -> Path:
    return ensure_dir(get_data_path() / "memory")


def get_bin_path(workspace: Path | None = None) -> Path:
    """Get the bin directory in data dir or the provided workspace."""
    root = ensure_dir(workspace) if workspace is not None else get_data_path()
    return ensure_dir(root / "bin")


def _copy_binary_resource(src, dest: Path) -> None:
    with as_file(src) as src_path:
        shutil.copy(src_path, dest)


def _copy_text_resource(src, dest: Path) -> None:
    dest.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")


def _sync_missing_dir(
    src_dir,
    dest_dir: Path,
    *,
    relative_to: Path,
    copy_file,
    should_include=None,
    silent: bool = True,
    log_message: str = "Created {}",
) -> list[str]:
    """Sync missing files from a source tree into a destination tree."""
    added: list[str] = []
    pending: list[tuple[object, Path, str]] = []

    def _sync(src_current, rel_parts: tuple[str, ...] = ()) -> None:
        for entry in src_current.iterdir():
            rel_path = Path(*rel_parts, entry.name)
            if entry.is_dir():
                _sync(entry, (*rel_parts, entry.name))
                continue
            if should_include is not None and not should_include(rel_path):
                continue

            dest = dest_dir / rel_path
            if dest.exists():
                continue

            pending.append((entry, dest, str(dest.relative_to(relative_to))))

    _sync(src_dir)

    def _copy_pending(item: tuple[object, Path, str]) -> str:
        entry, dest, rel_dest = item
        dest.parent.mkdir(parents=True, exist_ok=True)
        copy_file(entry, dest)
        logger.debug(log_message, dest)
        if not silent:
            logger.info(log_message, dest)
        return rel_dest

    if pending:
        with ThreadPoolExecutor(max_workers=min(32, len(pending))) as executor:
            added.extend(executor.map(_copy_pending, pending))

    return added


def timestamp() -> str:
    """Current ISO timestamp."""
    return datetime.now().isoformat()


_UNSAFE_CHARS = re.compile(r'[<>:"/\\|?*]')


def safe_filename(name: str) -> str:
    """Replace unsafe path characters with underscores."""
    return _UNSAFE_CHARS.sub("_", name).strip()


def split_message(content: str, max_len: int = 2000) -> list[str]:
    """
    Split content into chunks within max_len, preferring line breaks.

    Args:
        content: The text content to split.
        max_len: Maximum length per chunk (default 2000 for Discord compatibility).

    Returns:
        List of message chunks, each within max_len.
    """
    if not content:
        return []
    if len(content) <= max_len:
        return [content]
    chunks: list[str] = []
    while content:
        if len(content) <= max_len:
            chunks.append(content)
            break
        cut = content[:max_len]
        # Try to break at newline first, then space, then hard break
        pos = cut.rfind("\n")
        if pos <= 0:
            pos = cut.rfind(" ")
        if pos <= 0:
            pos = max_len
        chunks.append(content[:pos])
        content = content[pos:].lstrip()
    return chunks


def sync_bin_tools(workspace: Path | None = None, silent: bool = True) -> list[str]:
    """Sync bundled executable tools to the data dir or provided workspace."""
    bin_path = get_bin_path(workspace)
    src_root = pkg_files("winclaw") / "bin"
    return _sync_missing_dir(
        src_root,
        bin_path,
        relative_to=bin_path,
        copy_file=_copy_binary_resource,
        silent=silent,
        log_message="Copied executable tool: {}",
    )


def sync_workspace_templates(workspace: Path | None = None, silent: bool = False) -> list[str]:
    """Sync bundled templates to workspace. Only creates missing files."""
    workspace = ensure_dir(workspace or get_workspace_path())
    try:
        tpl = pkg_files("winclaw") / "templates"
    except Exception as e:
        logger.error(f"Failed to get templates directory: {'winclaw/templates'}, error={e}")
        return []
    if not tpl.is_dir():
        logger.error(f"Templates directory is not a directory, tpl={tpl}")
        return []

    def _should_include_template(rel_path: Path) -> bool:
        copy_dir = ["prompts", "skills"]
        # Root-level .md, memory/MEMORY.md, or any file under prompts/
        if len(rel_path.parts) == 1 and rel_path.suffix == ".md":
            return True
        if rel_path == Path("memory", "MEMORY.md"):
            return True
        if len(rel_path.parts) >= 1 and rel_path.parts[0] in copy_dir:
            return True
        return False

    added = _sync_missing_dir(
        tpl,
        workspace,
        relative_to=workspace,
        copy_file=_copy_text_resource,
        should_include=_should_include_template,
        silent=silent,
    )

    history_path = workspace / "memory" / "HISTORY.md"
    if not history_path.exists():
        history_path.parent.mkdir(parents=True, exist_ok=True)
        history_path.write_text("", encoding="utf-8")
        added.append(str(history_path.relative_to(workspace)))
    (workspace / "skills").mkdir(parents=True, exist_ok=True)

    if added and not silent:
        from rich.console import Console

        for name in added:
            Console().print(f"  [dim]Created {name}[/dim]")
    return added


def get_new_session_id() -> str:
    return str(uuid.uuid4())

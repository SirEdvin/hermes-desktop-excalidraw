"""Validated, revisioned storage for the workspace Excalidraw document."""

from __future__ import annotations

import hashlib
import fcntl
import json
import math
import os
import re
import stat
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

DRAWING_FILENAME = "hermes.excalidraw"
LOCK_FILENAME = f".{DRAWING_FILENAME}.lock"
MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
SUPPORTED_VERSION = 2
LOCK_TIMEOUT_SECONDS = 2.0

_REVISION_RE = re.compile(r"^[0-9a-f]{64}$")


class SceneError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class RevisionConflict(SceneError):
    def __init__(self, current_revision: str):
        super().__init__("revision_conflict", "The drawing changed since it was last read.")
        self.current_revision = current_revision


def empty_scene() -> dict[str, Any]:
    return {
        "type": "excalidraw",
        "version": SUPPORTED_VERSION,
        "source": "hermes-desktop-excalidraw",
        "elements": [],
        "appState": {},
        "files": {},
    }


def _serialize(scene: dict[str, Any]) -> bytes:
    try:
        raw = (json.dumps(scene, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
    except (TypeError, ValueError, RecursionError) as exc:
        raise SceneError("invalid_scene", "The scene must contain JSON-compatible values.") from exc
    if len(raw) > MAX_DOCUMENT_BYTES:
        raise SceneError("scene_too_large", "The Excalidraw document exceeds the 5 MiB limit.")
    return raw


def _reject_non_finite(value: Any) -> None:
    if isinstance(value, float) and not math.isfinite(value):
        raise SceneError("invalid_scene", "The scene contains a non-finite number.")
    if isinstance(value, dict):
        for item in value.values():
            _reject_non_finite(item)
    elif isinstance(value, list):
        for item in value:
            _reject_non_finite(item)


def validate_scene(scene: Any) -> dict[str, Any]:
    if not isinstance(scene, dict):
        raise SceneError("invalid_scene", "The Excalidraw scene must be a JSON object.")
    if scene.get("type") != "excalidraw":
        raise SceneError("invalid_scene", "The scene type must be 'excalidraw'.")
    if scene.get("version") != SUPPORTED_VERSION:
        raise SceneError("unsupported_version", f"Only Excalidraw scene version {SUPPORTED_VERSION} is supported.")
    if not isinstance(scene.get("elements"), list):
        raise SceneError("invalid_scene", "The scene must contain an elements array.")
    if not isinstance(scene.get("appState"), dict):
        raise SceneError("invalid_scene", "The scene must contain an appState object.")
    if not isinstance(scene.get("files"), dict):
        raise SceneError("invalid_scene", "The scene must contain a files object.")
    try:
        _reject_non_finite(scene)
    except RecursionError as exc:
        raise SceneError("invalid_scene", "The scene is nested too deeply.") from exc
    _serialize(scene)
    return scene


def _document_path(workspace: str | os.PathLike[str]) -> tuple[Path, Path]:
    try:
        root = Path(workspace).expanduser().resolve(strict=True)
    except (OSError, RuntimeError, ValueError) as exc:
        raise SceneError("workspace_unavailable", "The active workspace is unavailable.") from exc
    if not root.is_dir():
        raise SceneError("workspace_unavailable", "The active workspace is not a directory.")

    path = root / DRAWING_FILENAME
    try:
        if path.is_symlink() or not path.resolve(strict=False).is_relative_to(root):
            raise SceneError("path_escape", "The drawing path must stay inside the active workspace.")
    except (OSError, RuntimeError) as exc:
        if isinstance(exc, SceneError):
            raise
        raise SceneError("path_escape", "The drawing path could not be validated.") from exc
    return root, path


def _revision(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _decode(raw: bytes) -> dict[str, Any]:
    try:
        scene = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as exc:
        raise SceneError("invalid_json", "The existing drawing is not valid UTF-8 JSON.") from exc
    return validate_scene(scene)


def _read_document(path: Path) -> tuple[dict[str, Any], bytes, bool]:
    fd: int | None = None
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        scene = empty_scene()
        return scene, _serialize(scene), False
    except OSError as exc:
        raise SceneError("read_failed", "The drawing could not be inspected.") from exc
    try:
        metadata = os.fstat(fd)
        if not stat.S_ISREG(metadata.st_mode):
            raise SceneError("read_failed", "The drawing is not a regular file.")
        if metadata.st_size > MAX_DOCUMENT_BYTES:
            raise SceneError("scene_too_large", "The Excalidraw document exceeds the 5 MiB limit.")
        with os.fdopen(fd, "rb") as stream:
            fd = None
            raw = stream.read(MAX_DOCUMENT_BYTES + 1)
    except OSError as exc:
        raise SceneError("read_failed", "The drawing could not be read.") from exc
    finally:
        if fd is not None:
            os.close(fd)
    if len(raw) > MAX_DOCUMENT_BYTES:
        raise SceneError("scene_too_large", "The Excalidraw document exceeds the 5 MiB limit.")
    return _decode(raw), raw, True


def read_scene(workspace: str | os.PathLike[str]) -> dict[str, Any]:
    _, path = _document_path(workspace)
    scene, raw, exists = _read_document(path)
    return {
        "success": True,
        "scene": scene,
        "revision": _revision(raw),
        "exists": exists,
    }


@contextmanager
def _write_lock(root: Path) -> Iterator[None]:
    path = root / LOCK_FILENAME
    deadline = time.monotonic() + LOCK_TIMEOUT_SECONDS
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    except OSError as exc:
        raise SceneError("lock_failed", "The drawing lock could not be opened.") from exc
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise SceneError("lock_failed", "The drawing lock is not a regular file.")
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise SceneError("lock_timeout", "The drawing is busy; retry shortly.")
                time.sleep(0.05)
        yield
    finally:
        # Keep the inode: unlinking a lock lets writers lock different files.
        # The kernel releases flock when a writer dies; never steal by age.
        os.close(fd)


def _atomic_write(root: Path, path: Path, raw: bytes) -> None:
    try:
        fd, temporary_name = tempfile.mkstemp(prefix=f".{DRAWING_FILENAME}.", suffix=".tmp", dir=root)
    except OSError as exc:
        raise SceneError("write_failed", "The drawing temporary file could not be created.") from exc
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        try:
            directory_fd = os.open(root, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            pass
    except OSError as exc:
        raise SceneError("write_failed", "The drawing could not be saved atomically.") from exc
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def replace_scene(
    workspace: str | os.PathLike[str],
    scene: Any,
    expected_revision: str,
) -> dict[str, Any]:
    if not isinstance(expected_revision, str) or not _REVISION_RE.fullmatch(expected_revision):
        raise SceneError("invalid_revision", "expected_revision must be a SHA-256 revision.")
    validated = validate_scene(scene)
    raw = _serialize(validated)
    root, path = _document_path(workspace)

    with _write_lock(root):
        _, current_raw, _ = _read_document(path)
        current_revision = _revision(current_raw)
        if current_revision != expected_revision:
            raise RevisionConflict(current_revision)
        _atomic_write(root, path, raw)

    return {
        "success": True,
        "scene": validated,
        "revision": _revision(raw),
        "exists": True,
    }

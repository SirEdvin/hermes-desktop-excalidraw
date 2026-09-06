"""Hermes agent tool handlers for the shared Excalidraw scene."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .scene_store import RevisionConflict, SceneError, read_scene, replace_scene


def _workspace_from_context(task_id: str | None) -> Path:
    if task_id:
        try:
            from tools.terminal_tool import get_active_env

            env = get_active_env(task_id)
            cwd = getattr(env, "cwd", None) if env is not None else None
            if cwd:
                return Path(cwd)
        except (ImportError, RuntimeError):
            pass
    cwd = os.environ.get("TERMINAL_CWD")
    if cwd:
        return Path(cwd)
    raise SceneError("workspace_unavailable", "No active task workspace is available.")


def _error_payload(exc: SceneError) -> str:
    payload: dict[str, Any] = {
        "success": False,
        "error_code": exc.code,
        "message": str(exc),
    }
    if isinstance(exc, RevisionConflict):
        payload["current_revision"] = exc.current_revision
    return json.dumps(payload)


def excalidraw_read_scene(args: dict[str, Any], **kwargs: Any) -> str:
    try:
        if args:
            raise SceneError("invalid_request", "This tool does not accept arguments.")
        result = read_scene(_workspace_from_context(kwargs.get("task_id")))
        return json.dumps(result, ensure_ascii=False)
    except SceneError as exc:
        return _error_payload(exc)
    except Exception:
        return json.dumps(
            {"success": False, "error_code": "internal_error", "message": "The drawing could not be read."}
        )


def excalidraw_replace_scene(args: dict[str, Any], **kwargs: Any) -> str:
    try:
        if not isinstance(args, dict) or set(args) != {"scene", "expected_revision"}:
            raise SceneError("invalid_request", "scene and expected_revision are required.")
        result = replace_scene(
            _workspace_from_context(kwargs.get("task_id")),
            args["scene"],
            args["expected_revision"],
        )
        return json.dumps(result, ensure_ascii=False)
    except SceneError as exc:
        return _error_payload(exc)
    except Exception:
        return json.dumps(
            {"success": False, "error_code": "internal_error", "message": "The drawing could not be saved."}
        )

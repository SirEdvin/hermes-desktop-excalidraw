"""Profile-scoped HTTP bridge used by the desktop plugin."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

_PLUGIN_ROOT = Path(__file__).resolve().parents[1]
if str(_PLUGIN_ROOT) not in sys.path:
    sys.path.insert(0, str(_PLUGIN_ROOT))

from hermes_desktop_excalidraw.scene_store import (  # noqa: E402
    RevisionConflict,
    SceneError,
    read_scene,
    replace_scene,
)

router = APIRouter()
_EDITOR_PATH = _PLUGIN_ROOT / "desktop" / "editor.html"


class ReadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace: str = Field(min_length=1, max_length=4096)


class ReplaceRequest(ReadRequest):
    scene: dict[str, Any]
    expected_revision: str = Field(pattern=r"^[0-9a-f]{64}$")


@router.get("/editor-location")
async def editor_location():
    if not _EDITOR_PATH.is_file():
        raise HTTPException(
            status_code=503,
            detail={"error_code": "editor_unavailable", "message": "Rebuild the plugin editor assets."},
        )
    return {"url": _EDITOR_PATH.as_uri()}


def _raise_http(exc: SceneError) -> None:
    detail: dict[str, Any] = {"error_code": exc.code, "message": str(exc)}
    if isinstance(exc, RevisionConflict):
        detail["current_revision"] = exc.current_revision
        raise HTTPException(status_code=409, detail=detail)
    status = 413 if exc.code == "scene_too_large" else 400
    raise HTTPException(status_code=status, detail=detail)


@router.post("/scene/read")
async def read(request: ReadRequest):
    try:
        return await run_in_threadpool(read_scene, request.workspace)
    except SceneError as exc:
        _raise_http(exc)


@router.post("/scene/replace")
async def replace(request: ReplaceRequest):
    try:
        return await run_in_threadpool(replace_scene, request.workspace, request.scene, request.expected_revision)
    except SceneError as exc:
        _raise_http(exc)

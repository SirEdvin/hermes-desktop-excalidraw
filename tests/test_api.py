import asyncio

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from dashboard.plugin_api import ReadRequest, ReplaceRequest, editor_location, read, replace


def sample_scene():
    return {
        "type": "excalidraw",
        "version": 2,
        "elements": [],
        "appState": {},
        "files": {},
    }


def test_backend_reads_and_replaces_scene(tmp_path):
    first = asyncio.run(read(ReadRequest(workspace=str(tmp_path))))
    written = asyncio.run(
        replace(
            ReplaceRequest(
                workspace=str(tmp_path),
                scene=sample_scene(),
                expected_revision=first["revision"],
            )
        )
    )

    assert first["exists"] is False
    assert written["success"] is True
    assert asyncio.run(read(ReadRequest(workspace=str(tmp_path))))["scene"] == sample_scene()


def test_backend_exposes_only_the_fixed_local_editor():
    location = asyncio.run(editor_location())

    assert location["url"].startswith("file://")
    assert location["url"].endswith("/desktop/editor.html")


def test_backend_rejects_extra_fields():
    with pytest.raises(ValidationError):
        ReadRequest(workspace="/tmp", path="../../escape")


def test_backend_maps_validation_and_conflicts_without_tracebacks(tmp_path):
    first = asyncio.run(read(ReadRequest(workspace=str(tmp_path))))

    with pytest.raises(HTTPException) as malformed:
        asyncio.run(
            replace(
                ReplaceRequest(
                    workspace=str(tmp_path),
                    scene={"type": "excalidraw", "version": 2},
                    expected_revision=first["revision"],
                )
            )
        )
    assert malformed.value.status_code == 400
    assert malformed.value.detail["error_code"] == "invalid_scene"
    assert "Traceback" not in str(malformed.value.detail)

    asyncio.run(
        replace(
            ReplaceRequest(
                workspace=str(tmp_path),
                scene=sample_scene(),
                expected_revision=first["revision"],
            )
        )
    )
    with pytest.raises(HTTPException) as conflict:
        asyncio.run(
            replace(
                ReplaceRequest(
                    workspace=str(tmp_path),
                    scene=sample_scene(),
                    expected_revision=first["revision"],
                )
            )
        )
    assert conflict.value.status_code == 409
    assert conflict.value.detail["error_code"] == "revision_conflict"

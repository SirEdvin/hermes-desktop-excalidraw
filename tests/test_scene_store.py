import json
import os
import threading
from pathlib import Path

import pytest

from hermes_desktop_excalidraw.scene_store import (
    DRAWING_FILENAME,
    MAX_DOCUMENT_BYTES,
    RevisionConflict,
    SceneError,
    empty_scene,
    read_scene,
    replace_scene,
)


def sample_scene(label="box"):
    return {
        "type": "excalidraw",
        "version": 2,
        "source": "hermes-desktop-excalidraw",
        "elements": [{"id": label, "type": "rectangle", "x": 0, "y": 0, "width": 10, "height": 10}],
        "appState": {},
        "files": {},
    }


def test_missing_document_returns_deterministic_empty_scene_without_writing(tmp_path):
    first = read_scene(tmp_path)
    second = read_scene(tmp_path)

    assert first["scene"] == empty_scene()
    assert first["revision"] == second["revision"]
    assert first["exists"] is False
    assert not (tmp_path / DRAWING_FILENAME).exists()


def test_valid_document_is_read_without_rewriting(tmp_path):
    path = tmp_path / DRAWING_FILENAME
    raw = json.dumps(sample_scene(), indent=4).encode()
    path.write_bytes(raw)

    result = read_scene(tmp_path)

    assert result["scene"] == sample_scene()
    assert result["exists"] is True
    assert path.read_bytes() == raw


@pytest.mark.parametrize(
    "raw,code",
    [
        (b"not json", "invalid_json"),
        (b"[]", "invalid_scene"),
        (json.dumps({"type": "other", "version": 2, "elements": []}).encode(), "invalid_scene"),
        (json.dumps({"type": "excalidraw", "version": 99, "elements": []}).encode(), "unsupported_version"),
    ],
)
def test_invalid_existing_document_is_preserved(tmp_path, raw, code):
    path = tmp_path / DRAWING_FILENAME
    path.write_bytes(raw)

    with pytest.raises(SceneError) as error:
        read_scene(tmp_path)

    assert error.value.code == code
    assert path.read_bytes() == raw


def test_oversized_existing_document_is_rejected_before_parsing(tmp_path):
    path = tmp_path / DRAWING_FILENAME
    path.write_bytes(b" " * (MAX_DOCUMENT_BYTES + 1))

    with pytest.raises(SceneError, match="5 MiB") as error:
        read_scene(tmp_path)

    assert error.value.code == "scene_too_large"


def test_symlinked_document_cannot_escape_workspace(tmp_path):
    outside = tmp_path.parent / f"{tmp_path.name}-outside.excalidraw"
    outside.write_text("{}", encoding="utf-8")
    try:
        (tmp_path / DRAWING_FILENAME).symlink_to(outside)
    except OSError:
        pytest.skip("symlinks unavailable")

    with pytest.raises(SceneError) as error:
        read_scene(tmp_path)

    assert error.value.code == "path_escape"
    assert outside.read_text(encoding="utf-8") == "{}"


def test_replace_requires_current_revision_and_advances_it(tmp_path):
    initial = read_scene(tmp_path)

    written = replace_scene(tmp_path, sample_scene(), initial["revision"])

    assert written["revision"] != initial["revision"]
    assert written["scene"] == sample_scene()
    assert json.loads((tmp_path / DRAWING_FILENAME).read_text()) == sample_scene()

    with pytest.raises(RevisionConflict):
        replace_scene(tmp_path, sample_scene("stale"), initial["revision"])
    assert read_scene(tmp_path)["scene"] == sample_scene()


def test_malformed_replacement_does_not_create_or_modify_file(tmp_path):
    initial = read_scene(tmp_path)

    with pytest.raises(SceneError) as error:
        replace_scene(tmp_path, {"type": "excalidraw", "version": 2}, initial["revision"])

    assert error.value.code == "invalid_scene"
    assert not (tmp_path / DRAWING_FILENAME).exists()


def test_failed_atomic_replace_preserves_previous_bytes(tmp_path, monkeypatch):
    initial = read_scene(tmp_path)
    written = replace_scene(tmp_path, sample_scene(), initial["revision"])
    path = tmp_path / DRAWING_FILENAME
    previous = path.read_bytes()

    def fail_replace(source, target):
        raise OSError("simulated replace failure")

    monkeypatch.setattr(os, "replace", fail_replace)
    with pytest.raises(SceneError) as error:
        replace_scene(tmp_path, sample_scene("new"), written["revision"])

    assert error.value.code == "write_failed"
    assert path.read_bytes() == previous
    assert not list(Path(tmp_path).glob(f".{DRAWING_FILENAME}.*.tmp"))


def test_concurrent_writers_with_same_revision_have_one_winner(tmp_path):
    revision = read_scene(tmp_path)["revision"]
    barrier = threading.Barrier(2)
    outcomes = []

    def write(label):
        barrier.wait()
        try:
            replace_scene(tmp_path, sample_scene(label), revision)
            outcomes.append(("written", label))
        except RevisionConflict:
            outcomes.append(("conflict", label))

    threads = [threading.Thread(target=write, args=(label,)) for label in ("first", "second")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(outcome for outcome, _label in outcomes) == ["conflict", "written"]
    winner = next(label for outcome, label in outcomes if outcome == "written")
    assert read_scene(tmp_path)["scene"] == sample_scene(winner)

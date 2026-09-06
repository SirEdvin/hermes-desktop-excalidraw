import json

from hermes_desktop_excalidraw import register
from hermes_desktop_excalidraw import tools


def sample_scene():
    return {
        "type": "excalidraw",
        "version": 2,
        "elements": [],
        "appState": {},
        "files": {},
    }


class RecordingContext:
    def __init__(self):
        self.tools = []

    def register_tool(self, **tool):
        self.tools.append(tool)


def test_register_exposes_only_expected_full_schemas():
    ctx = RecordingContext()

    register(ctx)

    assert [tool["name"] for tool in ctx.tools] == [
        "excalidraw_read_scene",
        "excalidraw_replace_scene",
    ]
    for tool in ctx.tools:
        assert tool["schema"]["name"] == tool["name"]
        assert tool["schema"]["description"]
        assert tool["schema"]["parameters"]["type"] == "object"


def test_tools_use_task_workspace_and_share_scene_store(tmp_path, monkeypatch):
    monkeypatch.setattr(tools, "_workspace_from_context", lambda task_id: tmp_path)

    read = json.loads(tools.excalidraw_read_scene({}, task_id="task-1"))
    assert read["success"] is True
    assert read["exists"] is False

    replaced = json.loads(
        tools.excalidraw_replace_scene(
            {"scene": sample_scene(), "expected_revision": read["revision"]},
            task_id="task-1",
        )
    )
    assert replaced["success"] is True

    reread = json.loads(tools.excalidraw_read_scene({}, task_id="task-1"))
    assert reread["scene"] == sample_scene()
    assert reread["revision"] == replaced["revision"]


def test_tool_conflict_is_structured_and_preserves_scene(tmp_path, monkeypatch):
    monkeypatch.setattr(tools, "_workspace_from_context", lambda task_id: tmp_path)
    first = json.loads(tools.excalidraw_read_scene({}, task_id="task-1"))
    current = json.loads(
        tools.excalidraw_replace_scene(
            {"scene": sample_scene(), "expected_revision": first["revision"]},
            task_id="task-1",
        )
    )

    conflict = json.loads(
        tools.excalidraw_replace_scene(
            {"scene": {**sample_scene(), "source": "stale"}, "expected_revision": first["revision"]},
            task_id="task-1",
        )
    )

    assert conflict["success"] is False
    assert conflict["error_code"] == "revision_conflict"
    assert conflict["current_revision"] == current["revision"]
    assert json.loads(tools.excalidraw_read_scene({}, task_id="task-1"))["scene"] == sample_scene()

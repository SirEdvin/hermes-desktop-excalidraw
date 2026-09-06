#!/usr/bin/env python3
"""Load this repository through Hermes' real directory-plugin manager."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path

from hermes_cli.plugins import PluginManager
from tools.registry import registry


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("plugin_root", type=Path)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as temporary:
        home = Path(temporary).resolve()
        plugins = home / "plugins"
        plugins.mkdir()
        (plugins / "hermes-desktop-excalidraw").symlink_to(args.plugin_root.resolve(), target_is_directory=True)
        (home / "config.yaml").write_text(
            "plugins:\n  enabled:\n    - hermes-desktop-excalidraw\n",
            encoding="utf-8",
        )

        manager = PluginManager(scope_key=str(home))
        try:
            manager.discover_and_load()
            loaded = next(
                item for item in manager.list_plugins() if item["name"] == "hermes-desktop-excalidraw"
            )
            assert loaded["enabled"], loaded
            assert loaded["error"] is None, loaded
            names = ["excalidraw_read_scene", "excalidraw_replace_scene"]
            assert loaded["tools"] == len(names), loaded
            entries = {}
            for name in names:
                entry = registry.get_entry(name, scope=str(home))
                assert entry is not None, name
                assert entry.schema["name"] == name
                entries[name] = entry

            workspace = home / "workspace"
            workspace.mkdir()
            os.environ["TERMINAL_CWD"] = str(workspace)
            first = json.loads(entries["excalidraw_read_scene"].handler({}, task_id=None))
            assert first["success"] is True and first["exists"] is False
            written = json.loads(
                entries["excalidraw_replace_scene"].handler(
                    {
                        "scene": first["scene"],
                        "expected_revision": first["revision"],
                    },
                    task_id=None,
                )
            )
            assert written["success"] is True
        finally:
            manager.unload()


if __name__ == "__main__":
    main()

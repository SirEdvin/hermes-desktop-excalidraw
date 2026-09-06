READ_SCENE_SCHEMA = {
    "name": "excalidraw_read_scene",
    "description": (
        "Read the canonical Excalidraw scene for the active task workspace. "
        "Returns the complete scene and its revision for conflict-safe updates."
    ),
    "parameters": {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    },
}

REPLACE_SCENE_SCHEMA = {
    "name": "excalidraw_replace_scene",
    "description": (
        "Replace the complete Excalidraw scene for the active task workspace. "
        "Pass the revision returned by excalidraw_read_scene; stale revisions are rejected."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "scene": {
                "type": "object",
                "description": "Complete Excalidraw scene document.",
                "required": ["type", "version", "elements", "appState", "files"],
                "properties": {
                    "type": {"const": "excalidraw"},
                    "version": {"const": 2},
                    "elements": {"type": "array"},
                    "appState": {"type": "object"},
                    "files": {"type": "object"},
                },
                "additionalProperties": True,
            },
            "expected_revision": {
                "type": "string",
                "description": "SHA-256 revision returned by the latest read.",
                "pattern": "^[0-9a-f]{64}$",
            },
        },
        "required": ["scene", "expected_revision"],
        "additionalProperties": False,
    },
}

"""Shared Excalidraw workspace plugin."""

from .schemas import READ_SCENE_SCHEMA, REPLACE_SCENE_SCHEMA
from .tools import excalidraw_read_scene, excalidraw_replace_scene


def register(ctx):
    ctx.register_tool(
        name="excalidraw_read_scene",
        toolset="excalidraw",
        schema=READ_SCENE_SCHEMA,
        handler=excalidraw_read_scene,
    )
    ctx.register_tool(
        name="excalidraw_replace_scene",
        toolset="excalidraw",
        schema=REPLACE_SCENE_SCHEMA,
        handler=excalidraw_replace_scene,
    )


__all__ = ["register"]

"""Hermes directory-plugin entry point."""

try:
    from .hermes_desktop_excalidraw import register
except ImportError:  # Source-tree imports outside Hermes' plugin namespace.
    from hermes_desktop_excalidraw import register

__all__ = ["register"]

## Why

The desktop-only editor is invisible to agent sessions. Users need to ask Hermes to create or edit drawings without installing a Python plugin, service, or changing Hermes core.

## What Changes

- Add an explicit file-based agent handoff: export a fresh drawing snapshot and copy instructions containing its absolute path and a separate agent-output path.
- Let the user preview and apply the agent's output to the current canvas without manually navigating Excalidraw's import menu.
- Preserve local autosave and require an explicit choice before replacing a canvas that changed during the handoff.
- Document shared-filesystem requirements and that copied instructions, not tool registration, expose the ability to a session.
- Keep all implementation in this repository; do not modify agent configuration or AGENTS.md automatically.

## Capabilities

### New Capabilities

- `agent-file-handoff`: Desktop-only shared drawing files, agent instructions, and safe result application.

### Modified Capabilities

None. There are no existing main specifications in this checkout.

## Impact

Changes affect `src/pane.jsx`, editor scene integration, the generated root assets, tests, and README. Native Desktop file and clipboard APIs are compatibility dependencies. No new runtime service, Python plugin, or dedicated agent tools are introduced. Remote sessions only work when they can access the same paths.

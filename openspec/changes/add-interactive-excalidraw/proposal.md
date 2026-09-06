## Why

Hermes Desktop does not currently provide a shared visual workspace where a user and the active Hermes agent can inspect and edit the same diagram. Adding an embedded Excalidraw workspace makes diagramming available beside the conversation while keeping the drawing portable and under workspace control.

## What Changes

- Add a toggleable right-side Hermes Desktop pane containing a locally loaded Excalidraw editor.
- Store the current drawing as a workspace-relative `.excalidraw` file and restore it when the pane opens.
- Provide agent tools for reading and replacing the drawing scene through the same canonical file.
- Synchronize user edits and agent edits without silently overwriting a newer revision.
- Keep the initial editor usable without internet access.
- Report loading, validation, conflict, and persistence failures without discarding the last valid drawing.

## Capabilities

### New Capabilities

- `interactive-excalidraw-workspace`: Embedding, opening, persisting, and safely sharing an Excalidraw scene between the desktop user and Hermes agent tools.

### Modified Capabilities

None.

## Impact

- Replaces the placeholder desktop pane and notification-only status chip in `plugin.js`.
- Introduces the unified Hermes plugin package surfaces needed for desktop UI, agent tools, and a profile-aware backend route.
- Adds a pinned Excalidraw editor runtime/build artifact for offline use.
- Reads and writes a workspace-relative `.excalidraw` document; no cloud account or Excalidraw share service is required.

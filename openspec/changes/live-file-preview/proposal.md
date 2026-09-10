## Why

The agent-first workflow only needs a live rendering of a project drawing the agent edits with ordinary file tools. The existing canvas-first handoff adds unnecessary export, copy, preview and apply steps.

## What Changes

- Add a read-only live file view: select one existing `.excalidraw` file and automatically refresh its rendered image after valid file updates.
- Retain the last valid image during partial writes, malformed content, deletion or temporary read failures, and recover automatically.
- Keep the selected path scoped to profile/workspace, stop reads on closure or scope changes, and never write to the selected file.
- Preserve the existing manual editor and handoff as separate functionality; live viewing does not require either workflow.
- No project discovery, agent tools, automatic chat messages, backend plugin, filesystem synchronization or inline chat rendering.

## Capabilities

### New Capabilities

- `live-file-preview`: Scoped read-only rendering of one selected drawing file with automatic refresh and last-valid-image recovery.

### Modified Capabilities

None.

## Impact

Host pane controls and lifecycle, bounded native file reads, existing sandboxed Excalidraw rendering/scene validation, UI/browser/native Desktop tests, README and distributed root assets. Reuse existing React/SDK/Excalidraw dependencies; no Hermes core changes. Native read limits and same-filesystem access remain constraints.

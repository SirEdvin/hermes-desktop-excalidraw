## Context

See `proposal.md` for motivation and `specs/interactive-excalidraw-workspace/spec.md` for observable behavior.

The repository currently contains one uncompiled desktop `plugin.js`. Hermes disk plugins can import only `@hermes/plugin-sdk`, `react`, and `react/jsx-runtime`, while the Excalidraw React package requires its own build pipeline, styles, and browser assets. Agent tools execute in the Hermes process, whereas the editor executes in the Desktop renderer. Both therefore need a small shared backend around the workspace document.

Hermes supplies the active desktop workspace through `host.state.cwd`; agent tool handlers receive a task id from which the active execution environment and its cwd can be resolved. Desktop plugins can call their unified plugin backend through the profile-aware `ctx.rest` namespace.

## Goals / Non-Goals

**Goals:**

- Keep one portable `hermes.excalidraw` document at the active workspace root as the source of truth.
- Ship the editor locally while respecting the desktop plugin import boundary.
- Give the desktop pane and agent tools the same validated, conflict-safe read/write path.
- Preserve the last valid file and any unpersisted editor state when loading, validation, persistence, or synchronization fails.
- Keep runtime operation independent of Node.js and internet access after installation.

**Non-Goals:**

- Real-time multi-user collaboration or CRDT merging.
- Excalidraw cloud accounts, share links, or external persistence.
- Multiple named drawings, arbitrary-path browsing, or image attachment storage.
- Fine-grained element mutation tools; the initial agent write contract replaces a complete scene.
- Automatically opening the pane in response to an agent tool call.

## Decisions

### Use a unified Hermes plugin package

The repository will produce one installable Hermes plugin containing:

- a Python plugin half that registers `excalidraw_read_scene` and `excalidraw_replace_scene`;
- a backend route used by the desktop half for the same scene operations; and
- `desktop/plugin.js`, which registers the pane and its launcher control.

The tool handlers and backend routes will call one scene-store module so validation, revision checks, size limits, and atomic writes are implemented once.

Alternative considered: a desktop-only plugin pointing at `excalidraw.com`. It is smaller but fails offline operation and does not provide a supported structured scene bridge to the agent.

Alternative considered: configure the official Excalidraw MCP server. Hermes can discover its tools, but Hermes Desktop does not currently render MCP App resources as this persistent sidebar, and its checkpoint model would create a second source of truth.

### Load a self-contained local editor in an isolated webview

A build step will compile a pinned `@excalidraw/excalidraw` dependency into `desktop/editor.html` beside the generated `desktop/plugin.js`. The backend exposes only that fixed installed file URL, because Hermes evaluates runtime plugins from blob URLs and does not provide an SDK asset resolver. Keeping the editor separate also keeps `desktop/plugin.js` below Desktop's 16 MiB plugin-source limit. The runtime desktop plugin will continue to import only the three SDK-approved module specifiers. The Excalidraw runtime, styles, fonts, and workers needed by the editor will be included in the self-contained local HTML artifact.

The pane will mount an Electron `webview`. A narrow guest API will expose load, export, dirty-state, and error operations. The host will call it through `executeJavaScript`; the guest will not receive access to the Hermes SDK, gateway credentials, or the parent DOM.

Alternative considered: bundle Excalidraw directly into the plugin renderer. This risks a second React/ReactDOM runtime and couples a large editor dependency to Hermes Desktop's renderer realm.

### Use one fixed workspace-relative document

The canonical path will be `<active-workspace>/hermes.excalidraw`. Neither agent tool accepts an arbitrary path. The desktop backend request includes the exact cwd observed from `host.state.cwd`; the agent tools resolve cwd from the active task environment. The store appends the fixed filename only after normalizing the workspace root.

This deliberately postpones file pickers and multiple drawings. A fixed path keeps tool schemas small and prevents path traversal from becoming a feature.

### Use Excalidraw JSON plus content-hash revisions

The store will accept a UTF-8 JSON object with:

- `type: "excalidraw"`;
- a supported numeric `version`;
- an `elements` array;
- an optional `appState` object; and
- an optional `files` object.

Validation will reject malformed top-level structure, unsupported versions, non-finite JSON values, and payloads larger than 5 MiB. Excalidraw remains responsible for restoring and normalizing individual element defaults.

The revision is the SHA-256 digest of the exact persisted bytes. A missing document is represented by a deterministic valid empty scene and its digest, but is not written until the first successful edit. Every write requires `expected_revision` and returns the new revision.

Alternative considered: timestamps or incrementing counters. Content hashes require no sidecar metadata and continue to work after external file edits or source-control operations.

### Serialize compare-and-swap writes and replace atomically

For each canonical path, the store will:

1. acquire a bounded cross-process lock adjacent to the document;
2. read and validate the current bytes;
3. compare their digest with `expected_revision`;
4. serialize the accepted scene to a temporary file in the same directory;
5. flush the temporary file and atomically replace the canonical file; and
6. release the lock in `finally` cleanup.

The lock will use a stdlib exclusive-create lock file with a short timeout and stale-lock recovery. Same-directory replacement preserves atomic rename behavior. A failed validation, conflict, or replacement leaves the canonical file untouched.

Alternative considered: compare then rename without locking. Two Hermes processes could both pass the comparison and silently overwrite one another.

### Synchronize through revision polling with dirty-state protection

The pane host will poll the backend no faster than every two seconds, using the app's shared React Query client. This works locally and across OAuth remotes where plugin WebSockets are intentionally unavailable.

User changes are debounced before export from the guest editor and submitted with the revision from which they were edited. While a local write is pending or has failed, the host marks the scene dirty and will not load a different backend revision automatically. A conflict keeps the guest scene intact and offers an explicit reload action; retry requires first reading the new revision.

When a clean pane observes a new backend revision, it loads that scene into Excalidraw with change capture disabled and records the revision before accepting subsequent change events. This prevents a remotely loaded revision from being posted back as a fresh user edit.

Alternative considered: WebSocket-only synchronization. It is faster but unsupported for OAuth remotes and adds no correctness beyond revision polling.

### Register a persistent, accessible pane toggle

The desktop plugin will register a right-side hide-only pane. Hermes Desktop automatically provides one SDK-native command-palette toggle for that pane; the host layout store preserves its visible state across hot reloads and Desktop restarts. The command has an accessible label and keyboard activation. Excalidraw keeps its own keyboard and accessibility behavior inside the webview.

The initial plugin will not add duplicate status-bar, sidebar-navigation, and command-palette entries. One launcher is sufficient; additional entry points can be added if usage shows they are needed.

## Risks / Trade-offs

- [`desktop/editor.html` is large] → Keep source and generated artifacts clearly separated, pin Excalidraw, and verify the local editor makes no external runtime requests while `desktop/plugin.js` remains below the host source limit.
- [Electron `webview` behavior differs across Desktop platforms] → Exercise loading, resizing, keyboard input, and teardown on Linux first and add Windows/macOS verification before declaring those platforms supported.
- [Excalidraw schema evolves] → Pin the editor version and reject unsupported document versions rather than guessing migrations.
- [Polling delays agent updates by up to two seconds] → Accept for the initial version; add the existing `ctx.socket` accelerator only if measured latency is disruptive.
- [External editors can modify the file without the plugin lock] → Content-hash comparison detects the change before the next plugin write and converts it into a conflict.
- [A process can die while holding the lock file] → Include owner metadata and conservative stale-lock recovery; never remove a fresh lock.
- [Whole-scene replacement costs more tokens for large drawings] → Keep the initial API simple; add element-level operations only after representative scenes demonstrate the need.

## Migration Plan

1. Reshape the repository into a unified plugin package while keeping the plugin id `hermes-desktop-excalidraw`.
2. Build and commit the self-contained desktop runtime artifact.
3. Install the package into a test Hermes profile, enable both the Python and desktop halves, and verify a fresh workspace creates no file until edited.
4. Verify human edits, agent replacement, conflict rejection, invalid-file preservation, workspace switching, offline startup, and Desktop hot reload.
5. Roll back by disabling or removing the plugin. Existing `hermes.excalidraw` files remain ordinary portable documents and are not deleted.

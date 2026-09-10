## Context

See proposal.md for motivation. The host already tracks profile/workspace, uses a sandboxed local editor webview and exposes bounded scene requests through src/scene-client.js. The guest already validates/restores scenes and exports PNG previews. Native readFileText is a 512 KiB preview API with a truncation flag, not an unlimited reader. This change crosses the host/guest boundary and needs cancellation and validation, so a design is warranted.

## Goals / Non-Goals

**Goals:** Keep file ownership with the agent, reuse existing rendering dependencies and keep refresh independent from handoff state and local canvas storage.

**Non-Goals:** Watcher backend, new services/tools, shared-file editing, recursive discovery, inline chat artifacts or automatic agent vision feedback.

## Decisions

- Add an explicit Live file view alongside the existing manual workflow. One native file selection starts viewing; show the exact path, read-only status and a way to change file or return to the editor. Do not reuse handoff controls for refresh. Preserve the manual canvas rather than importing into it.
- Use the SDK query client with a scope/path-keyed query and a two-second refetch interval while the view is mounted. Inspect existing SDK signatures before implementation. This avoids assuming a native filesystem watcher API or adding a backend. Prevent overlapping reads/renders and guard every completion by the current scope/selection generation. Close/switch disables polling and invalidates pending results.
- Reuse bounded native reads, scene validation and sandboxed exportToBlob rendering. Add a render-only guest action independent of snapshot, staged preview, apply, backup and local autosave; factor the existing image rendering only where needed. A damaged or oversized manual canvas must not block rendering a separate valid live file. Keep the guest sandbox unchanged and pass request data through the existing JSON serialization boundary.
- Retain only the last successful image in component memory, plus the last successfully rendered raw content to skip unchanged work. Failed rendering must remain retryable even when source bytes do not change. Replace the image only after full validation/render success. Valid empty scenes clear it. Reset retained image on path/scope changes; errors must never mislabel another file's image.
- Remember only path and selected view in scoped plugin storage. Reload source data after reopening; do not persist source scene copies or images and do not write the selected file. Preserve spaces, Unicode and platform-specific literal paths.
- Provide accessible controls, image alternative text and non-blocking error/status output with responsive light/dark styling. Fit the rendered image within the pane without adding an editable canvas.

## Risks / Trade-offs

- Polling has bounded delay and reads unchanged files → use the two-second interval only while live view is active, serialize work and skip unchanged rendering.
- Partial writes and atomic file replacement can cause transient failures → read by path each time, retain the last good image and retry automatically.
- Native size cap and unsafe scene types limit supported input → enforce existing byte/scene limits and show an actionable status; no unbounded alternative reader.
- Remote agent projects may not exist on the Desktop filesystem → clearly document the shared-path requirement; do not imply transport or synchronization.
- Old guest responses could overwrite a newer selection → scope/generation checks on both asynchronous boundaries and targeted lifecycle tests.

## Migration Plan

Implement on a new feature branch based on the reviewed available baseline, without mixing unrelated changes or altering PR #5. Rebuild and commit root plugin.js/editor.html with source. Existing manual drawings and handoff metadata remain untouched. Rollback by returning to the previous plugin assets; no source-file migration is necessary. Verify branch/PR state before publishing and report platform gaps explicitly.

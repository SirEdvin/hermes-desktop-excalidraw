## 1. Unified Plugin and Scene Store

- [x] 1.1 Reshape the repository into one `hermes-desktop-excalidraw` unified plugin package with Python registration, backend manifest, desktop source, and generated `desktop/plugin.js`; verify Hermes PluginManager discovers the package and registers no unexpected tools.
- [x] 1.2 Implement the shared scene store with fixed `hermes.excalidraw` path resolution, deterministic empty scene, 5 MiB limit, top-level Excalidraw validation, and SHA-256 revisions; verify focused tests cover missing, valid, invalid, oversized, and escaping workspace inputs.
- [x] 1.3 Add bounded cross-process locking and compare-and-swap atomic replacement to the scene store; verify tests prove current revisions write successfully, stale revisions are rejected, and failed replacement preserves the previous bytes.

## 2. Agent and Backend Surfaces

- [x] 2.1 Register `excalidraw_read_scene` and `excalidraw_replace_scene` with full Hermes tool schemas, resolving the workspace from the active task environment rather than model-supplied paths; verify PluginManager smoke tests invoke both tools against a temporary workspace.
- [x] 2.2 Expose profile-aware read and replace backend routes that call the same scene store and accept only the desktop workspace root, scene, and expected revision fields; verify route tests cover success, malformed payloads, stale revisions, and redacted actionable errors.

## 3. Offline Excalidraw Editor

- [x] 3.1 Add the smallest build pipeline needed to pin Excalidraw, generate self-contained `desktop/editor.html`, and keep generated `desktop/plugin.js` below Hermes Desktop's 16 MiB source limit; verify a clean build succeeds and an automated check finds no external runtime script, stylesheet, font, worker, or asset request.
- [x] 3.2 Implement the isolated webview guest bridge for scene load, scene export, dirty state, and error reporting; verify a browser-level test loads an empty scene, edits it, exports it, and applies a remote scene without emitting a false local edit.
- [x] 3.3 Replace the placeholder pane and toast-only chip with one accessible, persistent pane toggle and a resizable right-side editor pane; verify keyboard activation, close/reopen preservation, hot reload, and workspace switching in Hermes Desktop.

## 4. Synchronization and Recovery

- [x] 4.1 Connect the pane to backend reads through React Query polling at a minimum two-second interval and debounce user writes with expected revisions; verify an agent replacement appears in a clean open pane without restarting Desktop.
- [x] 4.2 Add dirty-state and conflict handling that retains unsaved user content until explicit reload or retry; verify simulated user-after-agent and agent-after-user races preserve the canonical file and report conflicts on the stale writer.
- [x] 4.3 Add pane recovery states for unavailable backend, invalid existing file, oversized file, and write failure; verify each state leaves the last valid file unchanged and offers a usable retry or reload action.

## 5. Distribution and End-to-End Verification

- [x] 5.1 Document unified installation, both enable switches, the `hermes.excalidraw` workspace file, agent tool usage, rebuilding generated assets, and rollback; verify all documented commands against a fresh test profile.
- [x] 5.2 Run the Python tests, desktop build checks, and PluginManager smoke test, then validate the OpenSpec change strictly; verify every command exits successfully.
- [x] 5.3 Install the built package into a test profile and exercise first edit, restart restore, agent read, agent replace, conflict rejection, invalid-file preservation, workspace switching, pane resizing, and offline editor startup in the live Hermes Desktop app; record the observed result for every scenario without committing screenshots.

Verification evidence and platform boundaries are recorded in `tests/VERIFICATION.md`. Design-document reconciliation remains pending approval; no behavioral requirement was relaxed.

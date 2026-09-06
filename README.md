# Hermes Desktop Excalidraw

A unified Hermes plugin that gives the active desktop workspace a local Excalidraw pane and gives the active agent conflict-safe scene tools. The canonical drawing is `hermes.excalidraw` in the workspace root.

## Features

- Full Excalidraw editor in a toggleable, dockable Hermes Desktop pane
- Offline editor bundle with embedded fonts; no CDN is required at runtime
- Automatic synchronization between the pane and workspace file
- Revision checks and explicit conflict recovery instead of silent overwrites
- Agent tools: `excalidraw_read_scene` and `excalidraw_replace_scene`
- Atomic, workspace-confined persistence with a 5 MiB document limit
- Recovery drafts scoped to workspace and profile, retained across pane closure and restart

Supported and verified on Linux with a local workspace and a current Hermes Desktop exposing `host.openWorkspace`. Windows is not supported by the POSIX file-lock implementation; macOS has not been verified. Desktop and the backend must share the installed editor path (remote-only backends are not supported).

## Build

Node.js and pnpm are required only to rebuild the distributed desktop assets.

```sh
cd editor
pnpm install --frozen-lockfile
pnpm build
```

The build writes a small plain ESM `desktop/plugin.js` and a separate, self-contained `desktop/editor.html`. Keep both files together. Only the plugin JavaScript is subject to Hermes Desktop's 16 MiB plugin-source limit.

## Install

Use the Hermes home for the profile running Desktop. For the default profile this is usually `~/.hermes`; named profiles use `~/.hermes/profiles/<name>`.

```sh
export HERMES_HOME="$HOME/.hermes" # choose the home of the profile running Desktop
mkdir -p "$HERMES_HOME/plugins" "$HERMES_HOME/desktop-plugins"
ln -sT "$PWD" "$HERMES_HOME/plugins/hermes-desktop-excalidraw"
ln -sT "$PWD/desktop" "$HERMES_HOME/desktop-plugins/hermes-desktop-excalidraw"
hermes plugins enable hermes-desktop-excalidraw
hermes plugins list
```

Run these commands from the repository root. The links intentionally fail if an installation already exists: inspect it rather than overwriting another copy.
If Hermes asks for permission to override built-in tools, decline: this plugin does not need that privilege.

There are **two enable switches**. The CLI command enables the Python tools/backend. Restart that profile's backend/dashboard and start a fresh agent session. Then enable **Hermes Desktop Excalidraw** in Desktop's **Settings → Plugins**; run **Reload desktop plugins** from the command palette if it is not listed.

Open the command palette with **Ctrl+K**, select **Excalidraw: toggle drawing pane**, and press Enter. The same command closes the pane even when it is the last tab in its group. Open/closed state survives hot reload and restart. The initial position is to the right of the conversation; drag its divider to resize.

The current task workspace must be a local directory. Opening the pane reads `hermes.excalidraw`; a missing file appears as an empty canvas and is created only after the first saved edit.

## Saving and recovery

Edits save after a 700 ms debounce. A clean pane checks for agent updates every 2.5 seconds. **Saved** means the canonical file has been acknowledged, not just cached in the editor.

- **Conflict:** both versions remain intact. **Load disk** explicitly discards the local draft; **Keep mine** reads the latest revision and attempts a guarded replacement. Another concurrent write still wins a conflict, never a silent overwrite.
- **Save failed / Drawing unavailable:** repair the cause and use **Retry**. Invalid and oversized files are never reset automatically; repair or back up the file externally first.
- Unsaved drafts live in Desktop's local browser storage, keyed by profile and workspace. Closing the pane or changing workspace retains them. If local storage is full/unavailable, the pane reports it: keep that pane open until a successful save, because the in-memory copy cannot survive closing or a crash.

The adjacent `.hermes.excalidraw.lock` file is intentionally retained. The OS releases its lock when a process exits; do not delete it while writers are active. Revision checks serialize plugin writers. External editors do not participate in that lock, so avoid simultaneously saving from another application.

## Rollback

Wait for **Saved** (or resolve/export unsaved work), turn the desktop plugin off in **Settings → Plugins**, then run `hermes plugins disable hermes-desktop-excalidraw` for the same `HERMES_HOME` and restart the backend. Verify with `hermes plugins list`. The installation links may remain for later re-enablement. Workspace drawings are not removed; they remain ordinary Excalidraw files.

## Agent tools

1. Call `excalidraw_read_scene` to receive the complete scene and SHA-256 `revision`.
2. Edit the returned JSON scene.
3. Call `excalidraw_replace_scene` with the complete `scene` and `expected_revision`.
4. If `revision_conflict` is returned, read again before deciding how to merge or replace.

Both tools always target the active task workspace; callers cannot provide a path.

## Verify

```sh
uv run --with pytest --with fastapi python -m pytest -q -o 'addopts='
node --test tests/sync-state.test.mjs
cd editor
pnpm build
pnpm test:browser
```

The PluginManager smoke test uses the installed Hermes runtime:

```sh
cd /tmp
PYTHONPATH="$HOME/.hermes/hermes-agent" \
  "$HOME/.hermes/hermes-agent/venv/bin/python" \
  /path/to/hermes-desktop-excalidraw/tests/smoke_plugin_manager.py \
  /path/to/hermes-desktop-excalidraw
```

Validate the specification with `openspec validate add-interactive-excalidraw --strict`.

`tests/live-desktop.mjs` exercises the installed plugin through Electron CDP and the real Python agent tools. Run it **only against a disposable Desktop home and user-data directory**, never your normal session: it switches workspaces, injects a temporary backend-error harness, and reloads the renderer. Install and enable both halves first, finish the optional first-run screen, and use an isolated dashboard (`hermes dashboard --isolated`) with a distinct port. Point the test Desktop at that dashboard with valid local session authentication; `/api/status` reporting `auth_required: false` does not make plugin routes unauthenticated.

With a development renderer at port 5174 and that isolated Desktop exposing CDP at 9334:

```sh
EXCALIDRAW_ISOLATED_TEST=1 HERMES_SOURCE="$HOME/.hermes/hermes-agent" CDP_PORT=9334 node tests/live-desktop.mjs
```

The test prints each verified scenario and writes `verification.json` and a screenshot into a new `/tmp/excalidraw-e2e-*` directory, outside the repository. Browser tests separately verify offline startup, draft restoration, in-flight edit preservation, and storage failures.

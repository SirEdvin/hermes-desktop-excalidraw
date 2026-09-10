# Hermes Desktop Excalidraw

A desktop-only Excalidraw pane for Hermes. No Python plugin, backend routes, agent tools, or extra service.

## Features

- Full Excalidraw editor in a toggleable, dockable Hermes Desktop pane
- Offline editor bundle with embedded fonts; no CDN is required at runtime
- Local autosave scoped to workspace and profile, retained across pane closure and restart
- Standard Excalidraw file import/export and image export
- Light/dark canvas and resizable pane
- Read-only live file view: open one `.excalidraw` file and automatically refresh its image when an agent updates it
- Agent file handoff: copy instructions for Hermes, preview its result, and explicitly apply it without installing backend code

Requires a current Hermes Desktop exposing `host.openWorkspace` and the native `window.hermesDesktop.desktopPluginsRoot()` API. The editor loads locally and makes no backend calls. Hermes itself still has its normal startup requirements. Linux is the verification platform; macOS and Windows are not verified.

## Build

Node.js and pnpm are required only to rebuild the distributed desktop assets.

```sh
cd editor
pnpm install --frozen-lockfile
pnpm build
```

The build writes a small plain ESM `plugin.js` and a separate, self-contained `editor.html` at the repository root. Both are committed: installation requires no build. Only the plugin JavaScript is subject to Hermes Desktop's 16 MiB plugin-source limit. The build rejects upstream Google/Firebase configuration.

## Install

Use the Hermes home for the profile running Desktop. For the default profile this is usually `~/.hermes`; named profiles use `~/.hermes/profiles/<name>`.

```sh
export HERMES_HOME="$HOME/.hermes" # choose the home of the profile running Desktop
mkdir -p "$HERMES_HOME/desktop-plugins"
git clone https://github.com/SirEdvin/hermes-desktop-excalidraw.git \
  "$HERMES_HOME/desktop-plugins/hermes-desktop-excalidraw"
```

Keep the folder name **hermes-desktop-excalidraw**. Alternatively, link the entire repository (not a `desktop/` subdirectory) there. Keep `plugin.js` and `editor.html` together.

Enable **Hermes Desktop Excalidraw** in Desktop's **Settings → Plugins**; run **Reload desktop plugins** from the command palette if it is not listed. That is the only enable switch. Do not install or enable a Python plugin.

Open the command palette with **Ctrl+K**, select **Excalidraw: toggle drawing pane**, and press Enter. The same command closes the pane even when it is the last tab in its group. Open/closed state survives hot reload and restart. The initial position is to the right of the conversation; drag its divider to resize.

The pane also works without an open workspace. Switching workspace/profile selects a separate local drawing and restores that scope's selected live file, if any. It does not discover project files or write to the selected live file.

## Live drawings from an agent

1. Ask your agent to create a standard `.excalidraw` file in your project using its ordinary file tools. For example: **“Draw this project's architecture in `docs/architecture.excalidraw`. Use labeled shapes and arrows. Write complete Excalidraw JSON, preferably through a temporary file and rename.”**
2. In the Excalidraw pane, click **Open live file** and select that file. The picker starts in the current workspace (or the previously selected path).
3. Ask the agent to update the same file. The read-only image refreshes automatically: the plugin checks every **2 seconds** while live view is open. No handoff instructions, output-file pairs, or Apply button are needed.

The plugin never writes back to the viewed file or replaces your manual canvas. **Return to editor** stops live checks and reveals your previous manual drawing; **Open live file** can select a different file. Path and view selection are remembered per profile/workspace across pane closure and restart. On reopening, the current file is read again rather than restoring a cached image.

During incomplete JSON, missing files, oversized data or rendering errors, the last valid image for that file remains visible with a status message. Checks continue, so a later valid update recovers automatically. A valid empty drawing clears the previous image. Switching to another file or workspace never displays the old file's image under the new path.

Requires native Desktop `selectPaths` and `readFileText` support. Files must fit **512 KiB UTF-8 JSON** and **2,000 elements**, including restored scene data. Supported content is the same as the handoff limits below. Desktop and the agent must access the **same exact filesystem paths**; the plugin does not mount remote filesystems or translate paths. This renders an image for you, not automatic screenshot feedback to the agent. The manual editor and optional handoff workflow remain separate.

## Drawing with a Hermes session

The plugin does **not** register dedicated drawing tools. Instead, it helps a session use its existing file tools to edit a drawing. Desktop and the agent must be able to access the **same filesystem paths**. A remote agent, container, or another computer will not work unless those exact paths are shared; the plugin does not configure mounts or translate paths.

1. Open **Agent handoff** at the top of the drawing pane.
2. **Choose folder**: select an existing directory both Desktop and the agent can access. This creates portable copies of drawing content, so use a directory appropriate for its sensitivity.
3. **Prepare handoff** exports a uniquely named `.input.excalidraw` snapshot, verifies it by reading it back, and chooses a separate name for the agent's `.output.excalidraw` file.
4. **Copy agent instructions**, paste them into the intended Hermes session, and add your drawing request. The instructions include exact paths and Excalidraw JSON guidance. Nothing is sent automatically; existing sessions can use these instructions without restarting or changing tool configuration, provided their file tools are already enabled.
5. When Hermes reports that the output file is ready, click **Read result**. Inspect the preview, then choose **Apply result** or **Discard preview**.

Applying replaces the current drawing; it is not an automatic merge. If you edited the canvas after preparing the handoff, an explicit replacement checkbox is required. Editing again after preview requires reading the result again. Every successful application keeps a local recovery copy, available through **Download drawing before last agent result** inside the editor. Download it and use the editor's **Open** menu to restore it. If backup or local saving fails, the result is not applied.

Handoff paths are remembered per workspace/profile across pane closure and restart. Input/output files are never autosaved or automatically removed; prepare a fresh handoff for each request, and remove old files yourself when no longer needed. No agent configuration or `AGENTS.md` is modified.

### Handoff limits

- Requires native Desktop `selectPaths`, `readDir`, `readFileText`, and `writeTextFile` APIs; clipboard copying uses `writeClipboard`, with selectable instructions as a fallback.
- Each drawing is limited to **512 KiB of UTF-8 JSON** (the native reader's limit) and **2,000 elements**. Restored editor data must also fit this limit. Manual Excalidraw import/export remains available for larger drawings.
- Supports ordinary shapes, text, lines/arrows, freehand strokes, frames, and embedded PNG/JPEG/GIF/WebP images. Remote embeds, SVG image files and unsafe links are rejected rather than executed or fetched. Imported application state is limited to the canvas background.
- Files are validated before preview/application. Partial writes, malformed JSON, unsupported data, and truncated reads leave the canvas unchanged.
- Native Desktop writes are not atomic or exclusive. The plugin checks for existing files and uses unpredictable fresh names rather than updating shared files in place. Choose a trusted directory; do not let another process race the handoff filenames. The agent instructions request a complete temporary-file write followed by rename for its output.

### Updating an existing installation

Export important drawings first, then run `git pull --ff-only` inside the installed `desktop-plugins/hermes-desktop-excalidraw` directory after the feature is merged into your installed branch. Run **Reload desktop plugins** if it does not hot-reload. Keep `plugin.js` and `editor.html` together. No Python plugin or additional enable switch is needed.

## Saving and recovery

Edits are saved synchronously to Desktop's local browser storage. **Saved on this device** does not mean a file was written or synced to another computer. Use the editor menu's **Save to…** / **Save to file** to create a portable `.excalidraw` backup, **Open** to import one, or **Export image…** for an image.

- Local storage has a browser-managed quota. If saving fails, a visible warning tells you to keep the pane open and export a file before closing or switching workspaces. The last successfully saved drawing is not replaced by a failed write.
- Unreadable local data is not silently overwritten. Download the recovery data before choosing to start an empty canvas.
- Clearing Desktop's browser data, moving the installation, or using a different computer may lose access to local drawings. Export files for durable backups. Avoid simultaneously editing the same local drawing in multiple Desktop windows.

## Upgrading from the former combined plugin

Export any unsaved drawing before upgrading. Existing workspace `hermes.excalidraw` files are left untouched; open them manually in the new editor. Old browser recovery drafts are not automatically migrated.

If previously enabled, disable the old backend registration with `hermes plugins disable hermes-desktop-excalidraw` for that profile, then restart its backend. Replace any old Desktop symlink targeting `desktop/` with one targeting the repository root, or clone directly as above. The new version does not use `$HERMES_HOME/plugins/`. Export your drawings before uninstalling or clearing local data.

## Verify

```sh
cd editor
pnpm build
pnpm test:unit
pnpm test:browser
```

Unit tests cover file safety and the scoped host/guest transport. Browser tests exercise offline drawing, reload/workspace recovery, file import/export, storage failures, damaged data, handoff preview/application, and pane resizing. Live-file tests use the real React Query implementation (a test-only dependency; production uses the Desktop SDK) with native/renderer doubles, plus the real Excalidraw renderer in separate tests. They cover automatic updates, unchanged files, failure recovery, serialization of slow operations, cancellation, keyboard controls and responsive layouts. Live Desktop verification uses real native file/clipboard APIs with a disposable home and user-data directory, not the normal Desktop session.

For the live check, use a built Hermes source checkout with its development renderer running on port 5174:

```sh
EXCALIDRAW_ISOLATED_TEST=1 HERMES_SOURCE=/path/to/hermes-agent \
  xvfb-run -a node scripts/verify-desktop.mjs
```

Run from `editor/`. This Linux harness launches and stops its own isolated Hermes core backend and Electron process. It installs only `plugin.js` and `editor.html`, with no Python plugin. It tests real file export/readback, clipboard instructions, an agent-style edit using ordinary filesystem operations, preview/application, conflict consent, and restart recovery. It also selects a live file, checks automatic refresh after an atomic update and recovery after a partial write, then checks source/manual-canvas preservation and scoped selection recovery through workspace switches and restart. Only native picker interaction is stubbed; this is not a live model call. Results and screenshots are saved under a printed `/tmp/excalidraw-desktop-*` directory. Native guest captures avoid Chromium's webview-compositing artifacts in whole-window screenshots.

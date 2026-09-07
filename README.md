# Hermes Desktop Excalidraw

A desktop-only Excalidraw pane for Hermes. No Python plugin, backend routes, agent tools, or extra service.

## Features

- Full Excalidraw editor in a toggleable, dockable Hermes Desktop pane
- Offline editor bundle with embedded fonts; no CDN is required at runtime
- Local autosave scoped to workspace and profile, retained across pane closure and restart
- Standard Excalidraw file import/export and image export
- Light/dark canvas and resizable pane

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

The pane also works without an open workspace. Switching workspace/profile selects a separate local drawing; it does not read or write workspace files automatically.

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
pnpm test:browser
```

Browser tests exercise offline drawing, reload/workspace recovery, file import/export, storage failures, damaged data, and pane resizing. Live Desktop verification uses a disposable home and user-data directory, not the normal Desktop session.

For the live check, use a built Hermes source checkout with its development renderer running on port 5174:

```sh
EXCALIDRAW_ISOLATED_TEST=1 HERMES_SOURCE=/path/to/hermes-agent \
  xvfb-run -a node scripts/verify-desktop.mjs
```

Run from `editor/`. This Linux harness launches and stops its own isolated Hermes core backend and Electron process. It installs only `plugin.js` and `editor.html`, with no Python plugin. Results and screenshots are saved under a printed `/tmp/excalidraw-desktop-*` directory. Native guest captures avoid Chromium's webview-compositing artifacts in whole-window screenshots.

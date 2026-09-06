# Verification

Verified on Linux on 2026-09-05 using a disposable Hermes home, dashboard on port 9120, and Electron CDP on port 9334. The normal Desktop was not restarted. The backend and Desktop used the same locally installed plugin assets.

## Runnable checks

- Python: `uv run --with pytest --with fastapi python -m pytest -q -o 'addopts='` — 24 passed.
- Synchronization helpers: `node --test tests/sync-state.test.mjs` — 2 passed.
- Editor: `pnpm install --frozen-lockfile && pnpm build && pnpm test:browser` from `editor/` — build succeeded, 6 browser tests passed. pnpm reported an ignored esbuild install script; the actual build succeeded.
- PluginManager: README smoke-test command with the installed Hermes Python — exit 0, exactly the two declared tool handlers registered and invoked.
- OpenSpec: `openspec validate add-interactive-excalidraw --strict` — valid.
- `git diff --check` — clean.
- Generated runtime assets: `desktop/plugin.js` is 14,616 bytes, below the 16 MiB host limit; `desktop/editor.html` is 25,348,704 bytes and is loaded separately.

## Live Desktop

`EXCALIDRAW_ISOLATED_TEST=1 HERMES_SOURCE=/home/siredvin/.hermes/hermes-agent CDP_PORT=9334 node tests/live-desktop.mjs` exited 0. Its JSON result enumerates 14 passing scenarios:

| Scenario | Observed result |
| --- | --- |
| First human edit and agent read | Missing file stayed absent until editing; rectangle persisted and agent read it. |
| Agent update and stale agent write | Open editor converged without reload; stale replacement was rejected. |
| Single pane toggle | Closed even the last tab in its group; reopening restored the saved revision. |
| User-after-agent conflict | Canonical agent version and local draft both survived close/reopen and workspace switching; explicit recovery worked. |
| Write failure | Invalid lock target prevented replacement; existing bytes and dirty draft survived; Retry saved after repair. |
| Invalid and oversized documents | Original bytes remained unchanged; fixing the file restored editing. |
| Save completion after workspace switch | A real lock delayed the old save; its later completion did not change the new workspace's scene. |
| Keyboard activation | Ctrl+K, typed command, and Enter closed the drawing pane. |
| Native resizing | Dragging the pane divider changed the guest viewport while respecting the minimum width. |
| Offline guest editing | Drawing and saving worked with guest networking disabled and no external asset requests. |
| Backend outage | An explicitly injected rejection, not a fake successful response, retained the draft; Retry used the real backend after the fault was removed. |
| Hot reload | Reloaded the actual generated plugin, restored the drawing, and retained exactly one toggle. |
| Renderer restart | Restored open state and the canonical saved revision. |
| Desktop disable/re-enable | Removed the pane without changing the file; re-enabling restored the saved drawing and open state. |

Full Electron process restart was also verified separately: the isolated process was closed, relaunched with the same disposable home/user-data directory, and its restored workspace URL and saved revision matched the pre-restart values.

Browser tests additionally verified offline editor startup, dirty draft restoration after reload and workspace changes, generation-aware save acknowledgements, editing existing elements immediately after remote load, and local-storage failure reporting without discarding in-memory edits.

The README installation/link commands and Python enable/disable commands ran against a second fresh temporary home. `hermes config path` confirmed that home, plugin listing showed enabled then disabled, and both symlink targets matched this repository. Built-in tool override permission was not granted. Live Desktop enable/disable is covered above.

Final live evidence: `/tmp/excalidraw-e2e-FUPgPX/verification.json` and `/tmp/excalidraw-e2e-FUPgPX/desktop.png`. The screenshot was inspected: the right-hand editor, saved drawing, toolbar, and Saved status are visible. Screenshots and temporary authentication material are not part of the repository.

## Remaining boundaries

- Tested on Linux only; Windows is unsupported by the POSIX locking implementation and macOS is unverified.
- Installation into the user's normal profile, release publication, commits, and pushes were not performed.
- The design document still describes the earlier hide-only pane and age-based lock proposal. Approval to reconcile that document with the verified SDK workspace pane, scoped drafts, and kernel-managed locks was requested but timed out; its existing text was left unchanged in this continuation. The behavioral requirements were not changed.

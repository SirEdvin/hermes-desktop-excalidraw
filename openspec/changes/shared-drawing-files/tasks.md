## 1. Scene exchange and validation

- [x] 1.1 Inspect installed native file/clipboard signatures and Electron webview transport; implement a scoped, bounded scene snapshot/preview/apply contract without relaxing sandboxing; verify browser contract tests reject malformed requests and stale scope results.
- [x] 1.2 Add scene validation/restoration and recoverable pre-apply backup; verify valid shapes, text, arrows and embedded images round-trip while incomplete JSON, invalid coordinates, oversized data and storage failures preserve the existing scene.

## 2. Agent file workflow

- [x] 2.1 Add fresh file-pair creation in a user-selected existing directory with size checks, collision refusal and input readback verification; verify mocked native API tests for missing APIs, failures, Unicode paths, existing files and limits.
- [x] 2.2 Add the accessible Agent handoff UI and copyable instructions with exact paths and valid Excalidraw guidance; verify keyboard navigation, clipboard errors, dark/light and narrow layouts, and that no request is silently sent to an agent.
- [x] 2.3 Add explicit read-result preview and apply, scoped metadata recovery and local-change confirmation; verify workspace/profile switches, late reads, pane closure, restart and conflict backup recovery.

## 3. End-to-end delivery

- [x] 3.1 Extend isolated Desktop verification to export a real snapshot, edit the output via ordinary filesystem tools, preview/apply it, and recover it after restart; verify no Python plugin or separate service is installed for Excalidraw and record actual test output.
- [x] 3.2 Document the copy/paste handoff workflow, shared-filesystem limitation, native limits and update procedure; verify instructions against the isolated end-to-end check.
- [x] 3.3 Rebuild root plugin.js/editor.html and run the full browser suite plus handoff tests; verify generated artifacts contain the feature and existing offline import/export remains passing.
- [x] 3.4 Review the scoped diff and open the implementation PR on feat/shared-drawing-files when authorized; verify remote branch/PR state and report any remaining platform verification gaps.

## Verification outcome

- `pnpm build`: passed; distributed root assets rebuilt.
- `pnpm test:unit`: 9 passed.
- `pnpm test:browser`: 17 passed.
- Isolated Linux Desktop verification: passed native filesystem/clipboard handoff, preview/apply, conflict consent, workspace/pane lifecycle and restart recovery. The folder picker is stubbed; no live model call was made.
- `openspec validate shared-drawing-files --strict`: passed.
- PR: https://github.com/SirEdvin/hermes-desktop-excalidraw/pull/5 (open against main; no hosted checks reported at verification).
- macOS and Windows remain unverified. Same-path shared filesystem access is required for remote sessions.

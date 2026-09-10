## 1. Read-only rendering

- [x] 1.1 Recheck repository/PR baseline, create a separate implementation branch, and inspect native picker/read and SDK query signatures; verify the branch and documented API contracts before coding.
- [x] 1.2 Add a bounded render-only guest action reusing scene validation and PNG export without canvas snapshot/apply/save; verify real browser tests cover shapes/text/arrows/raster, empty scenes, malicious input, stale requests and an independently damaged manual canvas.

## 2. Live file view

- [x] 2.1 Add native single-file selection and scoped remembered path/view with accessible read-only image controls; verify cancellation, Unicode paths, missing APIs, narrow/wide light/dark layouts and keyboard use without file writes or manual-canvas changes.
- [x] 2.2 Add two-second scoped refresh through the SDK query client with serialized operations, unchanged-content skipping and last-valid-image retention; verify automatic valid updates, partial JSON, deletion/recreation, truncation, oversize, render failure/retry and valid empty files.
- [x] 2.3 Guard late reads/renders and stop refresh on exit, pane closure or scope switch; verify file switches, profile/workspace isolation, reopening, storage failure reporting and no old-image leakage.

## 3. End-to-end delivery

- [x] 3.1 Extend isolated Linux Desktop verification to select a real file, modify it using ordinary filesystem tools and observe automatic image updates without handoff/apply; verify partial-write recovery, unchanged source bytes from viewer operations, manual-canvas preservation and restart recovery, saving screenshots outside the repository.
- [x] 3.2 Document open-once live viewing, agent file-edit example, refresh cadence and native/shared-path limits; rebuild root assets and verify build, complete unit/browser suite, isolated Desktop harness and strict OpenSpec validation pass.
- [ ] 3.3 Review the scoped diff, commit/push on the new branch and open the implementation PR when authorized; verify remote head and PR state and report actual test results and unverified platforms.

## Context

See proposal.md for motivation. The current scene lives in guest localStorage; the host knows profile/workspace and renders a sandboxed webview. The inspected SDK has no agent-tool registration surface. Native preload exposes readFileText, selectPaths, and writeTextFile. The latter caps text at 1,000,000 characters and uses a non-atomic filesystem write without compare-and-swap. This is unsuitable for bidirectional autosave to an agent-owned shared file.

## Goals / Non-Goals

Goals: deliver an understandable file handoff using existing native APIs and ordinary agent file tools; retain local recovery and sandbox boundaries.

Non-goals: dedicated tools, invisible system-prompt injection, changing Hermes core, services, Python plugins, automatic multiwriter synchronization, or modifying workspace instruction files.

## Decisions

- Use separate immutable input and agent-output paths per handoff, with unpredictable identifiers in an explicitly chosen existing directory. Never autosave to these files. Verify input by reading it back before presenting a successful handoff. This avoids claiming transactional shared writes on an API without atomic compare-and-swap. Do not reuse user files.
- Provide one compact Agent handoff panel: choose directory, prepare/copy instructions, read result, preview and apply. The instructions specify literal absolute paths, standard Excalidraw JSON, preserving unrelated elements/IDs/files, and writing a complete output via temporary file and atomic rename using the agent's tools. Include a small valid shape/text example or bundled reference for reliable generation. Clearly label that the user must paste these instructions into the intended session.
- Keep native filesystem access in the host. Use a bounded, versioned host/guest scene exchange with request identifiers. Inspect Electron's existing webview messaging capabilities before selecting the transport. Do not enable Node in the guest, evaluate agent-authored JavaScript, or accept paths supplied by scene data. Any guest script invocation is fixed code with data serialized separately, never interpolated executable input.
- Validate imported JSON, element structures, supported file records, sizes and finite coordinates before invoking Excalidraw restoration. Reject malformed or oversized payloads without modifying local data. Show actionable native API compatibility errors. Respect host read/write limits instead of silently dropping images.
- Capture scope and local scene baseline when creating a handoff. Reading output does not apply it. Preview the candidate; applying requires explicit user action. If the local drawing changed, require confirmation and preserve a recoverable local backup. Scope changes invalidate pending callbacks and cannot apply into another workspace/profile. Closed panes leave files intact; persist only scoped handoff metadata to resume explicitly.
- No polling or automatic replacement: an explicit Read result action avoids partial writes and drawing interruptions. A later enhancement can add watching with the same preview/apply safety boundary.

## Risks / Trade-offs

- Additional user handoff steps → honest copy-and-paste workflow, no false claim of agent tool registration.
- Remote agent filesystem mismatch → visible shared-filesystem prerequisite and paths in instructions; no guessed path mapping.
- Large drawings exceed native caps → fail before write, preserve scene, explain manual export fallback.
- Agent can modify arbitrary files with its own permissions → instructions narrowly scope its task; plugin validates results and never follows scene-provided paths.
- Preview integration and scene restoration need runtime validation → browser contract tests plus isolated Electron checks, including real file exchange.

## Migration Plan

Additive feature only; retain existing localStorage keys and manual import/export. Rebuild and commit root distribution assets during implementation. Installation remains a clone into desktop-plugins. Rollback to the previous assets leaves exported files and existing local drawings untouched.

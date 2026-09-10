## Purpose

Enable Hermes sessions with ordinary file tools to edit drawings through explicit shared-file handoffs while the editor remains a desktop-only plugin.

## ADDED Requirements

### Requirement: Explicit desktop-only agent instructions
The plugin SHALL provide copyable instructions for the user's selected drawing handoff without registering dedicated agent tools, installing backend code, or modifying agent configuration or workspace instruction files. Instructions SHALL explain the shared-filesystem prerequisite and include exact input/output paths and a usable Excalidraw generation contract.

#### Scenario: User prepares a request
- **WHEN** the user prepares a handoff and copies its instructions
- **THEN** the instructions identify a verified exported input and a separate output path, explain how the agent edits the file, and tell the user to paste them into the intended session

#### Scenario: Unsupported environment
- **WHEN** required native filesystem APIs are unavailable
- **THEN** the plugin explains the compatibility issue and keeps manual editing and export available

### Requirement: Isolated file handoffs
The plugin SHALL create fresh input/output path pairs in an explicitly selected existing directory, SHALL NOT overwrite existing user files or autosave to agent files, and SHALL report successful export only after readback verification. Failed writes SHALL leave local drawings intact.

#### Scenario: Export failure
- **WHEN** a file write fails or exceeds a native size limit
- **THEN** no successful handoff is advertised and the current drawing remains recoverable

#### Scenario: Multiple handoffs
- **WHEN** the user prepares another handoff
- **THEN** earlier handoff files are not reused or overwritten

### Requirement: Safe result preview and application
The plugin SHALL validate an output file and allow preview before explicit application. Invalid, incomplete, or oversized output SHALL NOT replace the current scene. Local changes made since handoff SHALL require an explicit replacement decision and a recoverable backup before application.

#### Scenario: Agent returns a drawing
- **WHEN** the agent writes a valid result and the user reads, previews, and applies it
- **THEN** its drawing appears in the editor and survives reopening through existing local persistence

#### Scenario: Local drawing changed
- **WHEN** the user attempts to apply a result after making local edits
- **THEN** the plugin requires an explicit replacement decision and retains a recoverable copy of those edits

#### Scenario: Partial result
- **WHEN** the output contains incomplete JSON or invalid scene structures
- **THEN** an actionable error is shown without changing the canvas or its saved drawing

### Requirement: Scope and trust isolation
Handoffs SHALL remain associated with their originating profile/workspace. Late operations SHALL NOT affect another scope. Imported scene data SHALL NOT execute code or direct filesystem access.

#### Scenario: Workspace switch during read
- **WHEN** an output read finishes after switching workspace or profile
- **THEN** the result cannot modify the newly selected drawing

#### Scenario: Malicious output metadata
- **WHEN** output scene data includes executable-looking strings or filesystem paths
- **THEN** the plugin treats them as untrusted drawing data rather than code or filesystem commands

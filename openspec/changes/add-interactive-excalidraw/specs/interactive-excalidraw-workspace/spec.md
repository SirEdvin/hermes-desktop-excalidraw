## Purpose

Provide a workspace-scoped Excalidraw canvas that a Hermes Desktop user and the active Hermes agent can safely inspect and edit through one portable drawing document.

## ADDED Requirements

### Requirement: Toggleable drawing pane
The system SHALL provide an accessible control that opens and closes an Excalidraw pane on the right side of the Hermes Desktop layout. Closing the pane MUST NOT delete or reset the drawing.

#### Scenario: Open the drawing pane
- **WHEN** the user activates the Excalidraw control while the pane is closed
- **THEN** the system opens the pane and displays the drawing for the current workspace

#### Scenario: Close and reopen the drawing pane
- **WHEN** the user closes and later reopens the pane
- **THEN** the system displays the last successfully persisted drawing state

### Requirement: Offline editor availability
The system SHALL load the Excalidraw editor from locally installed plugin resources and SHALL support drawing without contacting Excalidraw or another external service.

#### Scenario: Open without network access
- **WHEN** the host has no internet connection and the plugin is installed and enabled
- **THEN** the user can open the pane and use the Excalidraw editor

### Requirement: Workspace-scoped drawing document
The system SHALL use one `.excalidraw` document in the current Hermes workspace as the canonical drawing state. A workspace change MUST switch the pane and agent tools to the document belonging to the new workspace.

#### Scenario: First use in a workspace
- **WHEN** no drawing document exists in the current workspace
- **THEN** the system presents an empty canvas and creates the document on the first persisted edit

#### Scenario: Existing drawing document
- **WHEN** a valid drawing document exists in the current workspace
- **THEN** the system loads that document without changing its scene content

#### Scenario: Workspace changes
- **WHEN** the active Hermes workspace changes
- **THEN** the system stops editing the previous workspace document and loads the document for the new workspace

### Requirement: Durable human edits
The system SHALL persist valid user edits to the canonical drawing document using an atomic replacement operation. A failed write MUST leave the last successfully persisted document readable.

#### Scenario: User changes the canvas
- **WHEN** the user adds, changes, or removes an element and no revision conflict exists
- **THEN** the system persists the updated Excalidraw document and exposes that revision to agent reads

#### Scenario: Persistence fails
- **WHEN** a user edit cannot be persisted
- **THEN** the system retains the unsaved editor state, reports the failure, and leaves the previous document unchanged

### Requirement: Agent scene inspection
The system SHALL provide an agent tool that returns the canonical scene elements, relevant application state, and a revision identifier for the current workspace drawing.

#### Scenario: Agent reads the drawing
- **WHEN** the agent invokes the scene inspection tool in a workspace containing a valid drawing
- **THEN** the tool returns that drawing and its current revision

#### Scenario: Agent reads a new workspace
- **WHEN** the agent invokes the scene inspection tool before a drawing document exists
- **THEN** the tool returns a valid empty scene and its revision without creating a file

### Requirement: Agent scene replacement
The system SHALL provide an agent tool that validates and atomically replaces the canonical scene when given a scene and the revision previously returned by scene inspection.

#### Scenario: Agent replaces the current scene
- **WHEN** the agent submits a valid scene with the current revision
- **THEN** the system persists the scene as a new revision and the open pane displays it

#### Scenario: Agent submits malformed scene data
- **WHEN** the agent submits data that is not a supported Excalidraw document
- **THEN** the tool rejects the update with validation details and does not change the canonical document

### Requirement: Conflict-safe synchronization
The system MUST reject an attempted write whose expected revision does not match the canonical revision. A conflict MUST preserve both the canonical document and the writer's unpersisted scene until the writer explicitly reloads or retries against the new revision.

#### Scenario: Agent writes after a user edit
- **WHEN** the agent submits a replacement using a revision older than the latest user edit
- **THEN** the tool reports a revision conflict and does not overwrite the user edit

#### Scenario: User edits after an agent update
- **WHEN** the pane attempts to persist an edit based on a revision older than the latest agent update
- **THEN** the pane reports a conflict, retains the unsaved user scene, and does not overwrite the agent update

### Requirement: Live convergence
The open pane SHALL detect a successfully persisted agent revision without requiring the plugin or Hermes Desktop to restart. It MUST NOT reapply a remote revision as a new local edit.

#### Scenario: Agent updates an open drawing
- **WHEN** the agent persists a new scene while the corresponding pane is open and has no unsaved local changes
- **THEN** the pane loads the new revision and presents the updated scene

### Requirement: Safe document access
The system MUST resolve the canonical drawing path from the active workspace, MUST reject path traversal outside that workspace, and MUST reject documents exceeding the supported safety limit before parsing or writing them.

#### Scenario: Workspace path escapes its root
- **WHEN** a request would resolve the drawing outside the active workspace
- **THEN** the system rejects the request without reading or writing the escaped path

#### Scenario: Drawing exceeds the safety limit
- **WHEN** a drawing read or write exceeds the supported document size
- **THEN** the system rejects the operation with an actionable error and leaves the canonical document unchanged

### Requirement: Invalid existing document recovery
The system MUST NOT replace an invalid existing drawing automatically. It SHALL report the validation failure and preserve the original bytes for manual recovery.

#### Scenario: Existing document is invalid
- **WHEN** the pane or agent tool encounters an invalid canonical drawing document
- **THEN** the system reports the error, does not initialize an empty replacement, and does not modify the invalid file

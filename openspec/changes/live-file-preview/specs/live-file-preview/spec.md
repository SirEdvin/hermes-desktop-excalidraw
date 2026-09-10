## Purpose

Display an agent-maintained Excalidraw file as a read-only image that refreshes automatically without a canvas handoff.

## ADDED Requirements

### Requirement: Select one read-only drawing
The plugin SHALL let the user select one existing `.excalidraw` file through a native file picker defaulting to the current workspace. It SHALL display its path and rendering without requiring snapshot preparation, copied instructions or application confirmation. Live viewing SHALL never write to the source file or replace the manual drawing.

#### Scenario: Open a project drawing
- **WHEN** the user selects a valid drawing file
- **THEN** the pane displays its read-only image and source path without changing the file or manual canvas

#### Scenario: Picker cancellation
- **WHEN** the user cancels selection
- **THEN** the current selection and image remain unchanged

### Requirement: Automatic valid updates
While live view is active, the plugin SHALL check the selected file automatically and display successfully rendered changes without further user action. Unchanged content SHALL not cause repeated rendering. A valid empty drawing SHALL replace a previous image with an empty-drawing indication.

#### Scenario: Agent updates the drawing
- **WHEN** an agent replaces the selected file with a changed valid drawing
- **THEN** a subsequent automatic check refreshes its displayed image without an Apply action

#### Scenario: Empty drawing
- **WHEN** the selected file becomes a valid scene with no visible elements
- **THEN** the previous image is replaced with an empty-drawing indication

### Requirement: Preserve last valid image through failures
The plugin SHALL retain the last successfully rendered image for the selected file when reads, validation or rendering fail and SHALL show a non-blocking status explaining the problem. It SHALL retry automatically and reject truncated or oversized native reads, unsafe embedded content and malformed scenes.

#### Scenario: Partial write and recovery
- **WHEN** the agent writes incomplete JSON and later completes a valid scene
- **THEN** the previous valid image remains visible during the error and updates automatically after recovery

#### Scenario: Missing or oversized file
- **WHEN** the file disappears, exceeds the supported limit or its read is truncated
- **THEN** the previous valid image remains visible with an explanatory status and automatic checks continue

#### Scenario: Missing native support
- **WHEN** required native file APIs are unavailable
- **THEN** live viewing presents an actionable error without breaking the manual editor

### Requirement: Scoped lifecycle and safe rendering
Selected paths SHALL be remembered per profile/workspace. Switching file or scope SHALL clear the previous file's displayed image, cancel obsolete results and prevent cross-scope display. Closing live view SHALL stop scheduled reads. Reopening SHALL read the remembered path afresh. Scene text SHALL remain data within the existing sandbox.

#### Scenario: Late result after switch
- **WHEN** an earlier read or render completes after a file or workspace switch
- **THEN** it cannot update the new view or restart the old refresh loop

#### Scenario: Reopen after restart
- **WHEN** the user reopens a previously selected live view after Desktop restart
- **THEN** the scoped path is restored and its current file contents are read automatically

#### Scenario: Executable-looking drawing content
- **WHEN** a scene contains executable-looking text or malicious embedded content
- **THEN** text is treated as drawing data and unsupported unsafe content is rejected without executing code

## Purpose

Defines how the plugin reads, compares, and writes a numeric order value in note frontmatter so sort order is portable, tool-agnostic, and safe under manual edits.

## ADDED Requirements

### Requirement: Configurable order property name

The plugin MUST let the user configure which frontmatter key holds the order value. The default key MUST be `order`.

#### Scenario: Default property

- **WHEN** the user has not changed settings
- **THEN** all order read and write operations use the frontmatter key `order`

#### Scenario: Custom property name

- **WHEN** the user sets the order property name to `sortIndex` in settings
- **THEN** read and write operations use `sortIndex` instead of `order`

### Requirement: Numeric order values

The plugin MUST treat the order property as a finite number for sorting. Non-numeric or missing values MUST follow the configured missing-value policy without throwing. The **normal** values written by the plugin are **integers** `1, 2, 3, …`.

#### Scenario: Valid integer

- **WHEN** a note’s frontmatter contains `order: 3`
- **THEN** the plugin parses it as numeric order `3` for comparison

#### Scenario: Valid non-integer (user-authored)

- **WHEN** a note’s frontmatter contains `order: 3.5` from manual edit
- **THEN** the plugin parses it for comparison until a reorder or renumber command normalizes scope to integers

#### Scenario: Missing property

- **WHEN** a note has no order property
- **THEN** the plugin assigns it a sort position according to settings (before or after notes with explicit order) and uses the configured tie-breaker among peers

#### Scenario: Invalid value

- **WHEN** the order property is present but not parseable as a number (e.g. `order: high`)
- **THEN** the plugin treats the note like a missing order per settings and MAY surface a non-blocking notice when the user triggers an order command on that file

### Requirement: Stable sort comparison

When ordering a set of notes, the plugin MUST sort by numeric order ascending or descending per settings, then apply a deterministic tie-breaker (default: path ascending) so equal or missing orders do not produce unstable ordering.

#### Scenario: Ascending with tie-breaker

- **WHEN** two notes have the same order value
- **THEN** their relative order is determined by the tie-breaker and remains stable across repeated sorts

### Requirement: Frontmatter write on reorder

When the plugin commits a new order for a note, it MUST persist only by updating that note’s frontmatter (creating a frontmatter block if absent). It MUST NOT store per-note order in plugin-only storage.

#### Scenario: Note without frontmatter

- **WHEN** reorder assigns order to a note with no YAML frontmatter
- **THEN** the file gains a valid `---` block containing the order property and preserves existing body content unchanged apart from the new block

#### Scenario: Note with existing frontmatter

- **WHEN** reorder assigns a new order value
- **THEN** only the order property value is updated and other frontmatter keys and formatting are preserved as far as the editor allows

### Requirement: Manual edits are authoritative

The plugin MUST NOT rewrite order values on file open, vault scan, or plugin load. It MUST only write order when the user performs an explicit reorder action or an explicit command that renumbers or fills order.

#### Scenario: External edit

- **WHEN** the user changes `order` in source mode or an external editor
- **THEN** the next sort or Bases display reflects the new value without the plugin reverting it until the user reorders or runs a normalize command

### Requirement: Sequential integer reassignment on move

When the user completes a reorder in an eligible Bases scope, the plugin MUST assign consecutive integer order values **`1, 2, 3, …`** to every note in that scope (or within the affected group when grouped) so the sequence matches the new display order and the **active Bases view’s** primary sort direction (ASC/DESC).

#### Scenario: Reorder in flat view (ascending)

- **WHEN** the user drops an item in an eligible Bases view with three visible notes and ascending order sort
- **THEN** those three notes receive orders `1`, `2`, and `3` in top-to-bottom display order after the move

#### Scenario: Reorder in flat view (descending)

- **WHEN** the user drops an item in an eligible Bases view with three visible notes and descending order sort
- **THEN** those three notes receive orders `3`, `2`, and `1` in top-to-bottom display order after the move (largest order at the top)

#### Scenario: Reorder in grouped view

- **WHEN** the user drops an item within one group
- **THEN** only notes in that group are renumbered to consecutive integers preserving order within the group

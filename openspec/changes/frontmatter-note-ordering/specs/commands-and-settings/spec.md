## Purpose

Exposes user configuration and explicit commands to initialize, normalize, and repair frontmatter order without relying on drag-and-drop alone.

## ADDED Requirements

### Requirement: Settings tab

The plugin MUST provide a settings tab under **Settings → Community plugins** with at least: order property name, sort direction default (for commands and comparison—not a gate on Bases drag eligibility), missing-order placement, tie-breaker field, and whether to show hints when Bases is not sorted by order.

#### Scenario: Change property name

- **WHEN** the user changes the order property name and saves settings
- **THEN** subsequent operations use the new name without requiring a vault restart

### Requirement: Fill missing order command

The plugin MUST provide a command that assigns order values to notes in a user-selected scope (active folder, or all notes in the current Bases result set when a Bases view is focused) that lack a valid numeric order. Assigned values MUST be **integers** that respect the current visual or path sort, typically continuing a `1, 2, 3, …` sequence without arbitrary large steps.

#### Scenario: Fill in folder

- **WHEN** the user runs “Fill missing order in folder” with the file explorer focused on a folder
- **THEN** each markdown file in that folder without valid order receives a new integer order and files with existing valid order are unchanged

### Requirement: Renumber order command

The plugin MUST provide a command that rewrites order values to **`1, 2, 3, …`** for a selected scope, preserving the current display sequence, for use after manual edits or inconsistent values.

#### Scenario: Renumber current Bases results

- **WHEN** the user runs renumber with an active eligible Bases view
- **THEN** every note in the current query result receives integer orders `1` through `n` in display order

### Requirement: Plugin disable leaves data intact

Disabling or uninstalling the plugin MUST leave all frontmatter order values in vault files unchanged.

#### Scenario: Disable plugin

- **WHEN** the user disables the plugin
- **THEN** notes retain their `order` (or configured key) values and Bases can still sort by that property using core behavior

### Requirement: Sample plugin removal

The shipped plugin MUST replace the Obsidian sample plugin behaviors (sample ribbon, sample commands, sample modal) with this plugin’s identity and commands.

#### Scenario: Clean command palette

- **WHEN** the plugin is enabled
- **THEN** sample-plugin demonstration commands are not registered

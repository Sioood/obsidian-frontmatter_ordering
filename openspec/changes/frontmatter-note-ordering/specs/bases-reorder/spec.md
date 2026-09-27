## Purpose

Integrates frontmatter-based order with Obsidian Bases so users can drag-and-drop to reorder rows or cards in `.base` views, with order persisted in each note’s frontmatter. Reorder interactions MUST be built on **[Pragmatic drag and drop](https://atlassian.design/components/pragmatic-drag-and-drop)** (`@atlaskit/pragmatic-drag-and-drop`), not a bespoke pointer-capture drag engine.

## ADDED Requirements

### Requirement: Pragmatic drag and drop engine

Bases reorder MUST use Atlassian **Pragmatic drag and drop** (element `draggable` / `dropTargetForElements` adapters and any required optional packages), bundled into the plugin `main.js`. The implementation MUST NOT treat a custom `pointerdown` + `setPointerCapture` gesture controller as the primary reorder mechanism after migration.

#### Scenario: Adapters cleaned up on DOM refresh

- **WHEN** Bases virtualizes or re-renders rows and the MutationObserver re-syncs items
- **THEN** previous Pragmatic drag and drop registrations are disposed and re-attached without duplicate handlers or leaks

#### Scenario: Drop carries stable file identity

- **WHEN** the user drops a dragged item on a valid target
- **THEN** the plugin resolves the correct `TFile` from drag data and view internals, not from a stale DOM index

### Requirement: Bases feature detection

The plugin MUST detect whether the Bases core plugin is enabled. Bases-specific UI MUST not register when Bases is disabled.

#### Scenario: Bases disabled

- **WHEN** Bases is not enabled in the vault
- **THEN** the plugin loads without Bases drag-and-drop hooks and without error notices on startup

#### Scenario: Bases enabled

- **WHEN** Bases is enabled
- **THEN** the plugin registers Bases reorder integration after plugin load

### Requirement: Eligible sort for drag reorder

Drag-and-drop reordering MUST be available when the active Bases view’s **primary sort** is the configured order property (ascending **or** descending). Renumber-on-drop MUST use the **view’s** current sort direction (ASC/DESC), not a separate plugin-only gate.

#### Scenario: Sorted by order ascending

- **WHEN** the Bases view primary sort is the order property ascending
- **THEN** whole-item drag reorder is active and drops update frontmatter order using ascending mapping (`1` at top)

#### Scenario: Sorted by order descending

- **WHEN** the Bases view primary sort is the order property descending
- **THEN** whole-item drag reorder is active and drops update frontmatter order using descending mapping (top = largest integer in scope)

#### Scenario: Wrong sort key

- **WHEN** the Bases view is sorted by another property
- **THEN** drag reorder is inactive and the UI MAY show a hint that names the order property and that ascending or descending sort is required

### Requirement: Drag reorder follows visual order in ASC and DESC

When eligible, drag-and-drop MUST use **visible display order** in the active view (table rows, list items, or gallery cards) to compute the insertion index and to renumber frontmatter after drop. Behavior MUST be equivalent for **ascending** and **descending** primary sort on the order property, using the view’s current direction for renumber mapping.

#### Scenario: Drop with ascending sort

- **WHEN** the view is sorted by order **ASC** (regardless of plugin settings sort direction)
- **THEN** moving an item higher in the list decreases its relative rank and, after drop, integers `1..n` match top-to-bottom display order (top = `1`)

#### Scenario: Drop with descending sort

- **WHEN** the view is sorted by order **DESC** (regardless of plugin settings sort direction)
- **THEN** moving an item higher in the list increases its relative rank in the view and, after drop, integers `1..n` are assigned so top-to-bottom display order still sorts correctly under DESC (top row = largest order value in scope)

#### Scenario: Indicator matches visible slot in both directions

- **WHEN** the user drags in an eligible view sorted ascending or descending
- **THEN** the insertion indicator and final drop index refer to the same visible position the user would expect between on-screen items

### Requirement: Drag affordance without handles

When eligible, the plugin MUST NOT show a separate drag handle. **List** and **gallery** items MUST use the **whole** row or card as the drag surface. **Table** reorder MUST start from the file or note **name** column only (`file.name`, `file.basename`, `note.title`, or equivalent name cell)—not from other property columns.

#### Scenario: No handle glyph

- **WHEN** reorder is eligible
- **THEN** the user does not see an added grip/handle control on items solely for this plugin

#### Scenario: Table name column starts reorder

- **WHEN** reorder is eligible in a table view and the user presses on a **name** cell in a `.bases-tbody` data row (e.g. `.bases-tr`) and crosses the movement threshold
- **THEN** the row reorders like list/gallery
- **AND** header and summary rows do not participate

#### Scenario: Table property column does not start reorder

- **WHEN** the user presses on a non-name **property** cell in a data row without crossing the reorder threshold
- **THEN** the plugin does not begin a reorder gesture from that press alone
- **AND** inline property editing remains available

#### Scenario: Table drag does not multi-select rows

- **WHEN** the user **actively reorders** by dragging from the name column past the movement threshold in a table view
- **THEN** the gesture MUST NOT leave a text selection or multiple highlighted/selected row appearance across rows passed during that drag
- **AND** only the dragged row shows the plugin dragging affordance until release
- **AND** suppression of selection styling MUST apply only for the duration of the active reorder drag, not on every pointer down on a row

#### Scenario: Table property cells editable when not dragging

- **WHEN** the user clicks or focuses a table **property cell** without crossing the reorder movement threshold
- **THEN** Bases inline property editing (checkbox, text, etc.) MUST work as default
- **AND** the plugin MUST NOT capture the pointer or call `preventDefault` on pointer down solely because the row is reorder-eligible

### Requirement: Native link drag disabled on reorderable items

While reorder is eligible, the plugin MUST prevent Obsidian’s default **link drag** (and related native HTML drag) from overriding Pragmatic drag and drop reorder on item chrome, including internal links, using PdD-safe patterns and Obsidian-specific guards as needed.

#### Scenario: Link drag blocked on item

- **WHEN** the user presses and moves on a row or card to reorder
- **THEN** a native link-drag or URL-drag operation does not take over the gesture

#### Scenario: dragstart on links

- **WHEN** a dragstart event would originate from a link or draggable child inside a reorderable item
- **THEN** the plugin prevents default for that dragstart while reorder is eligible (without removing click-to-open when the user is not reordering)

### Requirement: No conflict with default item activation

Reorder MUST be distinguishable from open-note or link navigation: taps/clicks that do not complete a Pragmatic drag and drop reorder MUST still activate Bases/Obsidian defaults (table name click opens note; property cells edit inline).

#### Scenario: Tap opens note

- **WHEN** the user taps a row or card without sufficient movement to start reorder
- **THEN** the plugin does not block Obsidian’s normal open/navigation behavior
- **AND** in table view, a short click on a row or file column still opens the note like native Bases

#### Scenario: Click on internal link without drag

- **WHEN** the user clicks a link without crossing the reorder threshold
- **THEN** navigation behaves as Bases/Obsidian default

#### Scenario: Drop does not open the note

- **WHEN** the user completes a reorder drag and releases the pointer over the dropped row or card (including after a successful frontmatter write or a no-op drop at the same index)
- **THEN** the plugin MUST suppress the synthetic **click** (and `auxclick`) that would otherwise open the note or follow a link
- **AND** the reorder MUST commit on that **first** pointer release without requiring a second click
- **AND** normal tap-to-open still works on a later interaction after the suppression window ends

### Requirement: Drop position indicator during drag

While a reorder drag is active, the plugin MUST show a clear **insertion indicator** at the position where the item will land if the user releases. The indicator MUST update as the pointer moves and MUST be removed when the drag ends or is cancelled. Indicator position and size MUST update **immediately** with pointer movement (no CSS transition on the marker).

#### Scenario: Indicator between items

- **WHEN** the user drags over the gap between two visible items
- **THEN** the UI shows an insertion marker between those items matching the intended drop index

#### Scenario: Gallery same-row gap

- **WHEN** the user drags between two cards on the same gallery row
- **THEN** the marker is a **vertical** bar between those cards with height limited to the card row (not the full multi-row grid height)

#### Scenario: Gallery first card on a row

- **WHEN** the drop index is immediately before the first card on a new row (after a row wrap)
- **THEN** the marker is a **vertical** bar on the leading edge of that card (card height), not a full-width horizontal bar across the grid

#### Scenario: Gallery row boundary

- **WHEN** the pointer is in the vertical gap between two rows
- **THEN** the marker is a thin **horizontal** bar on the row boundary with width spanning only the relevant row’s cards, not a tall vertical bar from the first row

#### Scenario: Indicator cleared on release

- **WHEN** the user releases the pointer or the drag is cancelled
- **THEN** the insertion indicator is removed from the DOM

### Requirement: Drag-and-drop across native Bases view types

When eligible, the plugin MUST support reorder via drag-and-drop in Bases **table**, **list**, and **gallery** views with comparable reliability.

#### Scenario: Table view drop

- **WHEN** the user drags from a table **name** cell to a new position in a data row and releases
- **THEN** order frontmatter in the visible scope updates to consecutive integers

#### Scenario: List view drop

- **WHEN** the user drags a list item to a new position and releases
- **THEN** behavior matches table view

#### Scenario: Gallery view drop

- **WHEN** the user drags a card to a new position in a gallery view and releases
- **THEN** behavior matches table view

### Requirement: Mobile touch reorder

When eligible, the plugin MUST support whole-item reorder on touch devices using touch-safe pointer handling (long-press or equivalent before move).

#### Scenario: Touch drag on phone or tablet

- **WHEN** the user performs a reorder gesture on a touch device in an eligible view
- **THEN** frontmatter order updates as on desktop without requiring a drag handle

### Requirement: Correct file mapping under virtualization

When the Bases view virtualizes rows (only a subset of DOM rows exist), the plugin MUST resolve each dragged or dropped item to the correct `TFile` using Bases view internals (row pools / entry index), not the DOM row index alone.

#### Scenario: Large table reorder

- **WHEN** the user reorders a note that appears below the first visible DOM rows (e.g. row 50 in a 1000-note base)
- **THEN** frontmatter updates apply to that note’s file, not to a different note at the same DOM position

### Requirement: Scope of reorder to visible result set

A drop operation MUST compute the new sequence relative to the **current query result** (after filters). Notes outside the visible scope MUST NOT be renumbered.

#### Scenario: Filtered base

- **WHEN** a filter hides some notes and the user reorders visible items
- **THEN** only notes in the visible scope are renumbered to consecutive integers in the new order

### Requirement: Metadata refresh after write

After updating frontmatter from a Bases drop, the plugin MUST rely on Obsidian’s normal metadata cache update so Bases re-queries and the view order matches stored frontmatter.

#### Scenario: Successful drop

- **WHEN** frontmatter write succeeds
- **THEN** the Bases view updates to show the new order within a reasonable time (same session)

#### Scenario: Write failure

- **WHEN** frontmatter write fails
- **THEN** the user sees a notice naming the file

### Requirement: Native Bases views only

The plugin MUST NOT register a separate custom Bases view type (e.g. plugin “ordered list”) as the primary reorder UX. Reorder MUST work by decorating **native** table, list, and gallery views.

#### Scenario: No custom view in picker

- **WHEN** the user configures a `.base` view
- **THEN** they use standard table, list, or gallery types only; the plugin does not require selecting a plugin-specific view

### Requirement: No order stored in the .base file

The plugin MUST NOT persist note order inside the `.base` file JSON or view state as the source of truth. Order MUST live only in note frontmatter.

#### Scenario: Base file only defines sort

- **WHEN** the user opens a `.base` file configured to sort by `order`
- **THEN** item sequence is determined solely from each note’s frontmatter `order` values

## Why

Obsidian users need a portable, tool-agnostic way to define a stable sort order for notes (projects, reading lists, curricula) without relying on folder position or proprietary plugin databases. Storing order in YAML frontmatter keeps notes readable in Git, other editors, and Dataview-style workflows, while Obsidian-specific UX (especially Bases views) should make reordering as easy as drag-and-drop without fighting manual edits to the same property.

## What Changes

- Replace the sample plugin with **Frontmatter Ordering**: a community plugin that reads a configurable frontmatter property (default `order`) for sorting and writes it when the user reorders items in supported UIs.
- Provide **settings** for property name, default sort direction, tie-breaker (e.g. path), and whether missing `order` sorts first or last.
- Integrate with **Obsidian Bases** (`.base` files): enable drag-and-drop reorder in **table, list, and gallery** native views when the view’s **primary sort** is the order property (**ascending or descending**); renumber-on-drop follows the **view’s** sort direction; persist changes by updating each note’s frontmatter. **No** custom Bases view type (e.g. plugin “ordered list” fallback).
- Use **consecutive integer ordering** (`1`, `2`, `3`, …) in the active scope after a reorder or normalize command so values stay human-readable and predictable (not large arbitrary steps such as 1000, 2000).
- **Reorder gestures** on list and gallery: drag the **whole row or card** (no per-item grip handles). **Table:** drag starts from the **file / note name column** only so other columns stay editable inline. Implement drag-and-drop with **[Pragmatic drag and drop](https://atlassian.design/components/pragmatic-drag-and-drop)** ([`@atlaskit/pragmatic-drag-and-drop`](https://github.com/atlassian/pragmatic-drag-and-drop))—element adapters, drop targets, and optional hitbox/auto-scroll packages—**instead of** a bespoke pointer-capture gesture controller. **Disable Obsidian/Bases native link drag** where it competes with reorder; preserve **tap/click to open** and inline property edit when not dragging.
- **Drop insertion indicator** while dragging (divider/line showing where the item will land before release).
- **Bases reorder mode toggle**: a toolbar control placed **immediately before** the Bases **sort** button (**Trier** / **Sort**—right-side cluster, not far-left of the bar) turns drag-and-drop reorder **on or off** for the active view. Default **on** when the view opens (overridable via plugin setting). When **on** and sort-eligible, reorder is armed; when **off**, no PdD adapters and normal scrolling/swiping apply.
- **Mobile**: touch reorder MUST work end-to-end (not opacity-only HTML5 drag). **Press-and-hold without moving** keeps Obsidian’s **mobile item menu** and normal long-press behavior; **press, hold, then move** past a threshold starts reorder and commits on release **without** opening the menu. Desktop keeps Pragmatic drag and drop; touch uses a **pointer-gated** path where PdD alone is insufficient. Sidebar swipe mitigation via reorder toggle + careful `touch-action`.
- **Respect manual frontmatter edits**: external or hand-edited `order` values are the source of truth until the user performs a reorder action or an explicit renumber/fill command.
- Expose **commands** to normalize order in a folder or for the current Bases result set, and to insert default order for notes missing the property.
- Document setup: users add the order property to Bases and sort by it **ascending or descending** (either direction enables drag); plugin **settings** sort direction applies to commands and tie-break comparison, not as a gate on Bases eligibility; optional snippets for default frontmatter.
- **Out of scope for this change** (planned later): drag-and-drop reorder in the File Explorer sidebar.

## Capabilities

### New Capabilities

- `frontmatter-order`: Configuration, parsing, comparison, and safe read/write of the order property on markdown notes (including notes without frontmatter, YAML edge cases, and concurrent manual edits). Normal form is **integer ranks** `1..n` in scope.
- `bases-reorder`: Bases integration on **native** table/list/gallery views—**Pragmatic drag and drop**, **reorder mode toolbar toggle** (default on), eligible when primary sort is the order property (ASC or DESC) **and** reorder mode is on, link-drag coexistence, mobile sidebar-swipe mitigation when reorder is on, name-column table drag + whole-item list/gallery, virtualized row/file resolution, map drops to frontmatter updates (including Obsidian 1.13+ `.bases-tbody .bases-tr` table rows).
- `commands-and-settings`: User-facing settings tab, commands (renumber, fill missing order), direction-aware hints, and notices for errors or partial failures.

### Modified Capabilities

<!-- None: no existing openspec/specs baseline in this repo -->

## Impact

- **Code**: Native Bases views; **Pragmatic drag and drop** on desktop; **touch pointer-gated reorder** on mobile where HTML5 drag fails; **reorder toggle** in Bases toolbar; gate on toggle + sort eligibility; long-press-without-move → native menu; move-threshold drag → reorder without menu on drop; table name column, list/gallery whole-item, virtualized `TFile` resolution, insertion indicator, assign pipeline.
- **Manifest**: Unchanged intent (`minAppVersion` 1.10.0+ for Bases APIs).
- **Dependencies**: Runtime **`@atlaskit/pragmatic-drag-and-drop`** (+ minimal optional packages: element adapter, hitbox/closest-edge and/or list-reorder patterns, auto-scroll as needed). Document license (Apache-2.0) in README. No network at runtime.
- **Performance**: Reorder may update multiple files in the visible Bases scope when renumbering to `1..n` (acceptable trade-off for simple integers).
- **Compatibility**: Vault-agnostic; other tools see only frontmatter. Disabling the plugin leaves order values in files unchanged.
- **Dev verification**: Obsidian CLI against **`dev-obsidian`** plus manual UI/mobile checks for Bases table, list, and gallery.

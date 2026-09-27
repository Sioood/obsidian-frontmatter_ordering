## Why

Obsidian users need a portable, tool-agnostic way to define a stable sort order for notes (projects, reading lists, curricula) without relying on folder position or proprietary plugin databases. Storing order in YAML frontmatter keeps notes readable in Git, other editors, and Dataview-style workflows, while Obsidian-specific UX (especially Bases views) should make reordering as easy as drag-and-drop without fighting manual edits to the same property.

## What Changes

- Replace the sample plugin with **Frontmatter Ordering**: a community plugin that reads a configurable frontmatter property (default `order`) for sorting and writes it when the user reorders items in supported UIs.
- Provide **settings** for property name, default sort direction, tie-breaker (e.g. path), and whether missing `order` sorts first or last.
- Integrate with **Obsidian Bases** (`.base` files): enable drag-and-drop reorder in **table, list, and gallery** native views when the view’s **primary sort** is the order property (**ascending or descending**); renumber-on-drop follows the **view’s** sort direction; persist changes by updating each note’s frontmatter. **No** custom Bases view type (e.g. plugin “ordered list” fallback).
- Use **consecutive integer ordering** (`1`, `2`, `3`, …) in the active scope after a reorder or normalize command so values stay human-readable and predictable (not large arbitrary steps such as 1000, 2000).
- **Reorder gestures** on list and gallery: drag the **whole row or card** (no per-item grip handles). **Table:** drag starts from the **file / note name column** only so other columns stay editable inline. **Disable Obsidian/Bases native link drag** on eligible items (`draggable=false`, block `dragstart`, etc.) so reorder does not compete with URL/link drag ghosts; use movement threshold (and touch long-press) so **tap/click still opens** notes and links.
- **Drop insertion indicator** while dragging (divider/line showing where the item will land before release).
- **Mobile**: touch reorder with the same whole-item + threshold/long-press model.
- **Respect manual frontmatter edits**: external or hand-edited `order` values are the source of truth until the user performs a reorder action or an explicit renumber/fill command.
- Expose **commands** to normalize order in a folder or for the current Bases result set, and to insert default order for notes missing the property.
- Document setup: users add the order property to Bases and sort by it **ascending or descending** (either direction enables drag); plugin **settings** sort direction applies to commands and tie-break comparison, not as a gate on Bases eligibility; optional snippets for default frontmatter.
- **Out of scope for this change** (planned later): drag-and-drop reorder in the File Explorer sidebar.

## Capabilities

### New Capabilities

- `frontmatter-order`: Configuration, parsing, comparison, and safe read/write of the order property on markdown notes (including notes without frontmatter, YAML edge cases, and concurrent manual edits). Normal form is **integer ranks** `1..n` in scope.
- `bases-reorder`: Bases integration on **native** table/list/gallery views—eligible when primary sort is the order property (ASC or DESC), **link-drag suppression**, name-column table drag + whole-item list/gallery, virtualized row/file resolution, map drops to frontmatter updates (including Obsidian 1.13+ `.bases-tbody .bases-tr` table rows).
- `commands-and-settings`: User-facing settings tab, commands (renumber, fill missing order), direction-aware hints, and notices for errors or partial failures.

### Modified Capabilities

<!-- None: no existing openspec/specs baseline in this repo -->

## Impact

- **Code**: Native Bases views only (drop fallback list view); pointer reorder (table name column, whole list/gallery item); virtualized `TFile` resolution; link-drag blocking; update README/styles.
- **Manifest**: Unchanged intent (`minAppVersion` 1.10.0+ for Bases APIs).
- **Dependencies**: No runtime npm dependencies beyond Obsidian types.
- **Performance**: Reorder may update multiple files in the visible Bases scope when renumbering to `1..n` (acceptable trade-off for simple integers).
- **Compatibility**: Vault-agnostic; other tools see only frontmatter. Disabling the plugin leaves order values in files unchanged.
- **Dev verification**: Obsidian CLI against **`dev-obsidian`** plus manual UI/mobile checks for Bases table, list, and gallery.

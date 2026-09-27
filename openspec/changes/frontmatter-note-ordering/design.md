## Context

The repo is the Obsidian sample plugin (TypeScript, esbuild). The product goal is frontmatter-only ordering with Bases drag-and-drop first; File Explorer reorder is a later phase. Obsidian **1.10+** exposes Bases APIs (`BasesView`, `BasesViewConfig.getSort()`). Reorder hooks **native** table/list/gallery DOM via a decorator controller—not a custom `registerBasesView` list type. Bases rows are query-derived—not persisted view state—so community practice is to store rank in **note properties** and sort the Base by that property.

**UX evolution:** Whole-item drag conflicted with links → dedicated **per-view handles** were tried (table/list/gallery). Handles work but add clutter. The plan **returns to whole-item reorder** on all views and relies on **disabling native link drag** plus gesture thresholds so open/tap still works.

Table DOM on Obsidian **1.13+** uses **`.bases-tbody .bases-tr`** for data rows (not `.bases-table-row`).

See `proposal.md` for motivation and scope boundaries.

## Goals / Non-Goals

**Goals:**

- Small, lazy-loaded codebase: no vault-wide indexing on startup.
- **Human-readable order values**: consecutive integers `1, 2, 3, …` in the active reorder scope.
- Bases **table, list, and gallery** reorder when primary sort is the order property (**ASC or DESC**); renumber mapping follows the **view** direction. Table: drag from name/title column; list/gallery: whole item.
- **No visible drag handles** on rows/cards when eligible.
- **Suppress Obsidian link / URL drag** on reorderable items so pointer reorder is not fighting `draggable` links.
- Movement threshold (desktop) and long-press + move (touch) so taps/clicks still open notes.
- Settings, commands, direction-aware hints, insertion indicator.

**Non-Goals (this change):**

- File Explorer sidebar drag-and-drop.
- Optional handle mode (handles removed for this iteration).
- Custom **ordered list** Bases view (`registerBasesView` spike—not productized).
- Storing order in `.base` files or plugin `data.json`.

## Decisions

### 1. Order model: sequential integers in scope

On drop, `assign` renumbers **every note in the reorder scope** to consecutive integers `1..n`. Drop index is always computed in **current on-screen display order** (DOM / query order in the active view), not raw numeric order values.

- **Bases sort ASC:** top item → `order: 1`, bottom → `order: n`.
- **Bases sort DESC:** top item → highest stored integer (`n`), bottom → `1`, so the view still sorts correctly after renumber.

Eligibility requires primary sort on the order property only (direction ignored for gating). Drag-and-drop MUST work in **both** ASC and DESC. Renumber mapping follows the **view’s** sort direction, not whether plugin settings `sortDirection` matches. The plugin settings `sortDirection` applies to commands and default comparison, not Bases eligibility. The insertion indicator and drop index MUST follow what the user sees on screen in either direction.

### 2. Frontmatter I/O

Unchanged — `metadataCache` + `processFrontMatter`.

### 3. Bases integration: decorator over native views

Unchanged discovery/eligibility/drop pipeline. **Interaction model (whole item, no handles):**

- **Reorder target / gesture start:**
  - **Table:** data rows `.bases-tbody .bases-tr`; pointer reorder **starts only** from the file/note **name** cell (`file.name`, `file.basename`, `note.title`, or cell with internal link)—not from other property columns (inline edit).
  - **List:** whole `.bases-list-item`.
  - **Gallery:** whole `.bases-cards-item`.
- **Virtualized tables/lists:** resolve `TFile` from Bases view row pools (`view-internals.ts`), not DOM row index alone.
- **No injected grip UI** — remove `drag-handle.ts` usage from DOM when applied.
- **Link-drag suppression (required):** on eligible items, set `draggable="false"` on item, links, and images; capture-phase `dragstart` prevention on the Bases container; optional document-level `dragstart` guard while items are marked reorderable. Goal: **no native link drag ghost** when the user intends to reorder.
- **Open vs reorder:** pointer down on item registers a **pending** gesture only—**no** `setPointerCapture` and **no** `preventDefault` on pointer down. Reorder starts only after **move threshold** (desktop) or **long-press + move** (touch); release without threshold → no reorder; **click** after non-drag → Bases/Obsidian open behavior (table row open, list item open, gallery card open).
- **Table — property edit vs row drag:** a click on a **property cell** without crossing the threshold MUST reach Bases cell editors (inline edit). Row-level reorder MUST NOT steal the gesture until threshold is exceeded. Do not apply table-wide `user-select: none` or row `pointer-events: none` on eligible rows at rest—only while `.frontmatter-ordering-reorder-active` / dragging.
- **After a completed drag:** extend a short suppression window and block **synthetic click** (and `auxclick`) at capture phase so release does **not** open the dropped item. **Do not** block the completing **pointerup** / **mouseup** on document—those must reach the reorder controller so the drop commits on first release. Optional one-shot **click** swallow on the Bases container, scheduled after the current pointer event (e.g. `requestAnimationFrame`). Detach blockers when `suppressClickUntil` expires.
- **While dragging only:** dragging class on item; dragged item `pointer-events: none` for hit-testing; insertion indicator follows pointer with **no CSS transition** on position/size. **Table:** during active reorder drag, disable text/row selection (`user-select: none` on tbody, `selectstart` prevention, clear `Selection`, clear `.is-selected` / `.is-active` on other rows) so crossing rows does not look like multi-select; when not dragging, native table selection and property focus MUST work.
- **Insertion indicator geometry:**
  - **Table / list:** thin horizontal bar between rows (full row width).
  - **Gallery (multi-row):** reading-order slots with **2D** targeting (closest gap + in-card half split). **Same row:** vertical bar between cards (height ≈ card, not grid height). **First card on a row** (wrap from previous row): vertical bar on the **leading edge** of that card (card height)—not a full-width horizontal bar spanning the previous row’s right edge to the new card. **Between rows** (gap): thin **horizontal** bar at the row boundary, width = **that row’s** card run (union of cards on the row), not a tall vertical span and not grid-wide bleed from unrelated columns.
- **Observer:** debounced `MutationObserver` on `.bases-view` only; ignore plugin indicator mutations; skip sync mid-drag.

**Alternatives:** Per-view handles — **rejected** after trial (clutter). Whole-item without link-drag suppression — **rejected** (conflicts with internal links).

### 4–8. Eligibility, performance, layout, manifest, CLI

Mostly unchanged. Module layout after apply:

```
src/bases/
  reorder-controller.ts  # pointer DnD, link-drag guards, table selection suppression
  dom-targets.ts         # selectors, name-column table drag, gallery indicator geometry
  view-internals.ts      # virtualized row → TFile
  context.ts             # eligibility, sort direction from getSort()
```

Remove or stop shipping `drag-handle.ts` and **`fallback-view.ts`** (ordered list spike—not registered in product spec).

## Risks / Trade-offs

- **[Link vs drag]** → Mitigate with `draggable=false`, `dragstart` blockers, threshold/long-press; accept some tuning per view.
- **[Table row DOM]** → Keep `.bases-tbody .bases-tr` selectors from 4.13.
- **[Tap mistaken as drag]** → Thresholds; user testing in section 7.
- **[Grouped bases / multi-file writes]** → Unchanged.

## Migration Plan

1. Update artifacts (this change).
2. **`/opsx-apply`**: remove `fallback-view.ts` registration; strip handles; table name-column + list/gallery gestures; link-drag suppression; README.
3. Renumber command for legacy `order` values if needed.

## Open Questions

- Minimum long-press on touch for table rows vs cards.
- Whether Bases sets `draggable="true"` on rows dynamically (re-apply on observer refresh).

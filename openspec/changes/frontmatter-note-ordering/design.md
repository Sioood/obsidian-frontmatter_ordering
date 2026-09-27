## Context

The repo is the Obsidian sample plugin (TypeScript, esbuild). The product goal is frontmatter-only ordering with Bases drag-and-drop first; File Explorer reorder is a later phase. Obsidian **1.10+** exposes Bases APIs (`BasesView`, `BasesViewConfig.getSort()`). Reorder hooks **native** table/list/gallery DOM via a decorator controller—not a custom `registerBasesView` list type. Bases rows are query-derived—not persisted view state—so community practice is to store rank in **note properties** and sort the Base by that property.

**UX evolution:** Whole-item drag conflicted with links → handles were tried and removed. Current shipped code uses a **custom pointer gesture controller**; the target architecture **replaces** that engine with **[Pragmatic drag and drop](https://atlassian.design/components/pragmatic-drag-and-drop)** while keeping the same user-visible rules (table name column, whole list/gallery item, insertion indicator, ASC/DESC renumber).

Table DOM on Obsidian **1.13+** uses **`.bases-tbody .bases-tr`** for data rows (not `.bases-table-row`).

See `proposal.md` for motivation and scope boundaries.

## Goals / Non-Goals

**Goals:**

- Small, lazy-loaded codebase: no vault-wide indexing on startup.
- **Human-readable order values**: consecutive integers `1, 2, 3, …` in the active reorder scope.
- Bases **table, list, and gallery** reorder when primary sort is the order property (**ASC or DESC**); renumber mapping follows the **view** direction. Table: drag from name/title column; list/gallery: whole item.
- **No visible drag handles** on rows/cards when eligible.
- **Pragmatic drag and drop** as the DnD engine (bundled, headless—plugin-owned CSS for indicator/dragging state).
- Coexist with Obsidian link drag and table property editors (conditional drag, minimal custom preview).
- Taps/clicks still open notes when the user is not performing a reorder drag.
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

### 3. Bases integration: decorator over native views + Pragmatic drag and drop

Unchanged: discovery, eligibility (`getSort()`), `assign` renumber, `view-internals` file resolution, debounced `MutationObserver` attach/cleanup on `.bases-view`.

**DnD engine:** Use **`@atlaskit/pragmatic-drag-and-drop`** ([docs](https://atlassian.design/components/pragmatic-drag-and-drop), [source](https://github.com/atlassian/pragmatic-drag-and-drop)). Import only needed pieces (core + **element adapter** at minimum; add **hitbox** / **auto-scroll** optional packages if they reduce custom code). Bundle into `main.js` with esbuild; no CDN.

**Registration model:**

- On each eligible-item sync, register **`draggable`** on list/gallery items (whole `.bases-list-item`, `.bases-cards-item`) and on table **name** cells or row subsets—not on every property cell.
- Register **`dropTargetForElements`** (and/or list-reorder-style targets between items) so drop index matches visible order; use **`getData` / `onDrop`** to pass stable item identity (`TFile` path or entry key), not DOM index.
- **`combine`** cleanup functions returned by PdD adapters when items unmount or observer refreshes (virtualized rows).

**Table — property edit vs drag:**

- **`canDrag`** (or drag-handle subset on name `td`) MUST return false for non-name cells so property editors stay default.
- Table rows: `.bases-tbody .bases-tr`; name cells: `file.name`, `file.basename`, `note.title`, or internal-link column per existing `dom-targets` rules.

**Link drag vs reorder:**

- Use PdD’s safe HTML5 DnD layering (`preventUnhandled` where appropriate, controlled drag preview, `onDragStart` guards) plus existing Obsidian-specific `dragstart` blocks on links **only when** they still compete after migration.
- Do not rely on a large custom `pointerdown` → `setPointerCapture` state machine as the primary path.

**Open vs drop:**

- After successful drop, suppress synthetic **click** on the dropped item (short window) so release does not open the note; first drop commit on release.
- While dragging: plugin dragging class, optional `pointer-events: none` on dragged item; table selection suppression only during active drag (same regression bar as today).

**Insertion indicator:**

- Drive position from PdD **drop target** / **closest-edge** hitbox events (or keep existing `dom-targets` geometry helpers fed by active target index). **No CSS transition** on the marker. Gallery 2D rules unchanged (vertical between cards on a row, horizontal on row gaps, etc.).

**Virtualization:** Unchanged — `resolveFileForBasesItem` / row pools; PdD `getInitialData` must carry identity that survives DOM recycle.

**Alternatives:**

- **Custom pointer DnD (current code)** — **superseded** by this decision (maintenance, browser consistency, virtualization-friendly patterns).
- Per-view grip handles — **rejected** (clutter).
- React-only Atlassian drop-indicator components — **avoid**; prefer headless PdD + plugin CSS unless a small non-React helper package is sufficient.

### 4–8. Eligibility, performance, layout, manifest, CLI

Mostly unchanged. Module layout after apply:

```
src/bases/
  reorder-controller.ts  # PdD register/cleanup, attach lifecycle, drop → assign
  pragmatic-dnd.ts       # thin wrappers: draggable + drop targets, shared getData types
  dom-targets.ts         # selectors, name-column rules, gallery indicator geometry
  view-internals.ts      # virtualized row → TFile
  context.ts             # eligibility, sort direction from getSort()
```

Remove or stop shipping `drag-handle.ts` and **`fallback-view.ts`** (ordered list spike—not registered in product spec).

## Risks / Trade-offs

- **[Link vs drag]** → PdD element adapter + conditional `canDrag`; keep link `dragstart` guards if Obsidian still wins; re-test table name column and gallery cards.
- **[Bundle size]** → PdD core is small; only import optional packages used; tree-shake via esbuild.
- **[Table row DOM]** → Keep `.bases-tbody .bases-tr` selectors from 4.13.
- **[Tap mistaken as drag]** → Thresholds; user testing in section 7.
- **[Grouped bases / multi-file writes]** → Unchanged.

## Migration Plan

1. Update artifacts (this change).
2. **`/opsx-apply`**: migrate reorder to Pragmatic drag and drop; re-verify table/list/gallery + section 7 manual QA; README dependency note.
3. Renumber command for legacy `order` values if needed.

## Open Questions

- Which PdD optional packages to adopt (hitbox vs fully custom indicator positioning).
- Touch behavior with HTML5 DnD on iOS/Android in Obsidian WebView (validate in 7.6).
- Whether Bases resets DOM attributes on refresh (re-register PdD adapters on observer sync).

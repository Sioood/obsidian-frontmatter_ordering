## Context

The repo is the Obsidian sample plugin (TypeScript, esbuild). The product goal is frontmatter-only ordering with Bases drag-and-drop first; File Explorer reorder is a later phase. Obsidian **1.10+** exposes Bases APIs (`BasesView`, `BasesViewConfig.getSort()`). Reorder hooks **native** table/list/gallery DOM via a decorator controller—not a custom `registerBasesView` list type. Bases rows are query-derived—not persisted view state—so community practice is to store rank in **note properties** and sort the Base by that property.

**UX evolution:** Whole-item drag conflicted with links → handles removed → **Pragmatic drag and drop** adopted. On **mobile**, horizontal swipes still open Obsidian **left/right sidebars**, which fights horizontal drag on list/gallery rows; users may need a **vertical** move before reorder “locks.” Mitigation: a **reorder mode toggle** in the Bases toolbar (default **on**) arms PdD only when enabled and applies touch/gesture guards on the Bases surface while armed.

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
- **Reorder mode toggle** in Bases view chrome (desktop + mobile), default on.

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

### 3b. Reorder mode toggle (Bases toolbar)

**Problem:** On phones/tablets, edge swipes reveal vault/file sidebars; list/gallery reorder drags are often horizontal first.

**UI:**

- Inject a **toggle button** **immediately before** the native **sort** control only (`insertAdjacentElement('beforebegin', sortAnchor)`), in the **right** toolbar cluster (just left of **Trier** / **Sort**), **not** at the far left near view picker / result count (see reference: toggle wrongly at left of **Vue** is incorrect).
- **Sort anchor resolution:** locate the real sort button—visible text **Trier** or **Sort**, or sort `aria-label` / tooltip—not `toolbar.querySelector`’s first/last generic icon. Then `beforebegin` on that element.
- Do **not** use `viewRoot.prepend`, toolbar-wide `prepend`, or `appendChild` when sort is found. Fallback only when sort cannot be resolved after localized selectors.
- Shown on **desktop and mobile** when the plugin is enabled and Bases is active.
- **Default state: ON** (`reorder mode armed`). Plugin setting **`defaultBasesReorderMode`** (boolean, default `true`) sets initial state when a Bases leaf is first attached; toggling is per active Bases container until reload (optional later: persist per `.base` view—out of scope unless needed).

**Behavior:**

| Reorder toggle | Sort eligible | Result |
|----------------|---------------|--------|
| OFF | any | No PdD registration; no insertion indicator; sidebar swipes unchanged |
| ON | no | Show sort hint if enabled; no PdD |
| ON | yes | Register PdD adapters; reorder works per §3 |

**Mobile sidebar coexistence (toggle ON + eligible):**

- Apply **`touch-action`** (e.g. `pan-y` on list/gallery/table body) and/or **capture-phase touch/pointer** handling on the Bases **view container** so horizontal drags on items prioritize reorder over **sidebar edge-swipe** where the platform allows—without breaking vertical scroll.
- When toggle is **OFF**, remove those styles/listeners so Obsidian sidebar gestures behave normally.
- Document in README: turn reorder **off** to swipe sidebars freely; turn **on** to reorder (may require starting with a **vertical** move on some devices).

**Module layout addition:**

```
src/bases/
  reorder-toggle.ts    # toolbar button, armed state, touch-action helpers
  touch-reorder.ts     # optional: touch gesture gate + pointer drag (if split from controller)
```

**Alternatives:**

- Always-on reorder with no toggle — **rejected** (mobile sidebar conflict).
- Vertical-only drag lock before horizontal — **optional enhancement**; toggle is primary UX.

### 3c. Mobile touch: long-press vs drag (hybrid with PdD)

**Observed failure (mobile):** With reorder armed, items **opacity** changes but **do not move**; on release Obsidian opens the **mobile context / item menu**. HTML5 drag via Pragmatic drag and drop alone is **unreliable** in Obsidian’s mobile WebView (touch drag often does not produce a real drop).

**Target behavior (reorder toggle ON + eligible):**

| Gesture | Outcome |
|---------|---------|
| **Press and hold, little or no movement, release** | **No reorder.** Obsidian/Bases default: mobile item menu, tap-to-open, or scroll—plugin does **not** block `contextmenu` or long-press. |
| **Press, hold past short delay, then move** past movement threshold | **Reorder drag** starts: insertion indicator tracks pointer; drop renumbers; **no** mobile menu on that release. |
| **Short tap** | Open note / default activation (unchanged). |

**Implementation direction (apply):**

- **Desktop** (`pointerType === 'mouse'` or fine pointer): keep **PdD** `draggable` / `dropTargetForElements` as today.
- **Touch:** do **not** depend on native HTML5 drag starting from first `touchstart`. Use a **touch gesture controller** (can live in `reorder-controller.ts` or `touch-reorder.ts`) that:
  - Listens on reorderable items when armed.
  - On `pointerdown`/`touchstart`: record origin; **do not** call `preventDefault` until reorder is committed.
  - If movement &lt; threshold before timeout → on `pointerup`, **do nothing** (menu may show).
  - If movement ≥ threshold (or long-press + move): set **dragging** state, drive indicator + drop index via existing `resolveDropPlacement` / `assign` (same as pre-PdD pointer path); optionally call PdD only on desktop.
  - On successful touch reorder end: suppress **synthetic `click`** and **`contextmenu`** briefly so release does not open the menu.
- Revisit **`touch-action: pan-y`** on armed surfaces: must not block touch reorder once gesture is locked; apply stricter `touch-action: none` **only on the dragged item** during active reorder, not the whole view at rest.
- **Table (mobile):** same name-column rule; long-press on name cell then move.

**Alternatives (DnD engine):**

- **PdD-only on touch** — **rejected** (broken drag + spurious menu; current bug).
- **Custom pointer path on touch, PdD on desktop** — **accepted** (hybrid).
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
- **[Mobile sidebar swipe vs reorder]** → Reorder toggle + nuanced `touch-action`; pointer-gated touch reorder (§3c).
- **[Mobile menu vs reorder]** → Hold-without-move passes through; move-threshold reorder suppresses menu on drop (§3c).
- **[Grouped bases / multi-file writes]** → Unchanged.

## Migration Plan

1. Update artifacts (this change).
2. **`/opsx-apply`**: §10 mobile touch reorder (hybrid); re-verify §7 / §9 manual QA; README.
3. Renumber command for legacy `order` values if needed.

## Open Questions

- Which PdD optional packages to adopt (hitbox vs fully custom indicator positioning).
- Exact Bases toolbar DOM hook for sort-adjacent toggle (validate per Obsidian version).
- Exact long-press delay and move threshold (ms / px) for touch vs mouse.
- Whether Obsidian mobile menu is `contextmenu` or custom long-press (detect in dev-obsidian on device).
- Whether Bases resets DOM attributes on refresh (re-register PdD adapters on observer sync).

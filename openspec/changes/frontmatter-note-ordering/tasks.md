## 1. Plugin identity and scaffolding

- [x] 1.1 Update `manifest.json` (id, name, description, `minAppVersion` 1.10.0) and strip sample plugin UI from `src/main.ts`
- [x] 1.2 Add `src/settings.ts` with defaults: property name `order`, sort direction, missing-order policy, tie-breaker, Bases hint toggle
- [x] 1.3 Register settings tab and wire `loadData` / `saveData` in plugin lifecycle

## 2. Frontmatter order core

- [x] 2.1 Implement `order/parse.ts` — read numeric order from metadata cache with invalid/missing handling per settings
- [x] 2.2 Implement `order/compare.ts` — stable comparator (order + tie-breaker)
- [x] 2.3 Implement `order/write.ts` — create or patch frontmatter for order only; preserve body and other keys
- [x] 2.4 Rework `order/assign.ts` — **sequential integers `1..n` in scope** on Bases drop (not fractional / 1000-step); support ascending and descending mapping
- [x] 2.5 Update fill/renumber commands to use **`1, 2, 3, …`** only; refresh README manual check table for integer semantics

## 3. Commands

- [x] 3.1 Implement “Fill missing order in folder” using explorer selection or active file folder
- [x] 3.2 Implement “Renumber order in folder” with evenly spaced values preserving current sort
- [x] 3.3 Implement “Renumber order in current Bases view” when a Bases leaf is active
- [x] 3.4 Register commands with stable IDs and user-facing notices on partial failure
- [x] 3.5 Align command outputs with integer `1..n` semantics per updated spec (fill continues sequence; renumber always `1..n`)

## 4. Bases reorder integration

- [x] 4.1 Detect Bases enabled; no-op registration when disabled
- [x] 4.2 Implement eligibility from `BasesViewConfig.getSort()` — primary sort on order property (**ASC or DESC**); renumber uses view direction, not settings match
- [x] 4.3 Implement `bases/reorder-controller.ts` — attach on layout/active leaf; debounced MutationObserver lifecycle
- [x] 4.4 Implement `bases/dom-targets.ts` — row/card selectors for table, list, gallery; map DOM index to `TFile` from query result
- [x] 4.5 Whole-item drag (superseded by 4.10–4.11): pointer threshold + link suppression — replaced after link/open conflicts
- [x] 4.6 Handle grouped Bases data (reorder within group only; renumber integers within group)
- [x] 4.7 Hint banner: property name + **ascending or descending** required; settings-gated
- [x] 4.8 **Dropped** — no custom “ordered list” `registerBasesView`; native table/list/gallery DOM only (remove leftover `fallback-view.ts` in apply)
- [x] 4.9 **Drop insertion indicator** — divider/line (or equivalent) at target index while dragging; before/after logic; remove on release/cancel; table, list, gallery
- [x] 4.10–4.15 Handle-based iteration (superseded by 4.16–4.20): per-view grips; table `.bases-tr` discovery retained in code
- [x] 4.16 **Remove drag handles** from table, list, gallery (stop injecting grips; remove handle-only CSS)
- [x] 4.17 **Whole-item reorder** on all view types using `itemSelectorForKind` (incl. `.bases-tbody .bases-tr`); container/item `pointerdown` + threshold / touch long-press
- [x] 4.18 **Disable native link drag** on eligible items: `draggable=false` on items/links/images; capture `dragstart` on Bases container; re-apply on observer refresh when Bases resets attributes
- [x] 4.19 **Open vs drag** — click/tap without threshold opens note; brief click suppress only after completed drag; no handle-only listeners
- [x] 4.21 **Suppress open on drop** — after completed drag, block synthetic **click** only (not the completing pointerup); drop commits on first release; tap-to-open after window ends
- [x] 4.22 **Table drag selection** — no text/multi-row selection highlight **only while actively reordering** a `.bases-tr` row (regression: must not break click-to-open or cell property edit at rest)
- [x] 4.23 **Table pointer deferral** — no `setPointerCapture` / `preventDefault` on pointer down; capture and selection suppression only after movement threshold (preserve tap-to-open and inline property edit)
- [x] 4.24 **Table CSS at rest** — `user-select` / `pointer-events` restrictions on tbody rows only during `.frontmatter-ordering-reorder-active`, not on every `.frontmatter-ordering-item`
- [x] 4.25 **Table name-column drag** — `shouldStartTableReorderPointer` / name cells only; property columns editable at rest
- [x] 4.26 **Virtualized file resolution** — `view-internals.ts` row pools; not DOM index alone
- [x] 4.27 Remove unused `fallback-view.ts`, `registerFallbackBasesView`, and related CSS from `main.ts` / `styles.css`
- [x] 4.20 Update **README** and styles for whole-item reorder (no grip); document link-drag suppression behavior

## 5. Styles, docs, and release hygiene

- [x] 5.1 Update `styles.css` — dragging state on **item**; **insertion indicator** styles (handle styles superseded by 5.5)
- [x] 5.2 Update `README.md` — integer order, whole-item drag, asc/desc hint, mobile, link-gesture note
- [x] 5.5 ~~Handle-based docs~~ **Superseded** by 4.16–4.25 (whole-item list/gallery; table name column; no handles)
- [x] 5.3 Run `npm run lint` and `npm run build`; reload in **`dev-obsidian`** via `obsidian vault=dev-obsidian plugin:reload id=obsidian-frontmatter_ordering`
- [x] 5.4 Refresh CLI examples in README (`property:read` expects `1`, `2`, `3` after renumber)

## 6. Obsidian CLI checks (`vault=dev-obsidian`)

- [x] 6.1 `obsidian vault=dev-obsidian plugins:enabled filter=community` — plugin listed after enable
- [x] 6.2 After renumber or reorder, `property:read name=order path=<note>` — values are **integers in `1..n` scope**
- [x] 6.3 `base:query path=<test.base> view=<view> format=json` — entry order matches frontmatter when view sorts by `order`
- [x] 6.4 `command id=<fill-missing-command-id>` — missing keys filled with integer sequence (not 1000+)
- [x] 6.5 `dev:errors` / `dev:console` — no uncaught errors during reload and command runs

## 8. Pragmatic drag and drop migration (replaces custom pointer engine in §4.17–4.23)

- [x] 8.1 Add `@atlaskit/pragmatic-drag-and-drop` (+ element adapter; hitbox/auto-scroll only if needed); configure esbuild to bundle; note Apache-2.0 in README
- [x] 8.2 Add `src/bases/pragmatic-dnd.ts` — shared drag data types, `draggable` / `dropTargetForElements` helpers, `combine` cleanup
- [x] 8.3 Refactor `reorder-controller.ts` — register/dispose PdD adapters on observer sync; remove primary pointer-capture gesture state machine
- [x] 8.4 Table: `dragHandle` on name column cells (`findTableNameCellInRow`); property columns not registered as drag handles
- [x] 8.5 List/gallery: whole-item `draggable`; `monitorForElements` + drop commit; existing `assign` pipeline + `view-internals` file resolution
- [x] 8.6 Insertion indicator via `resolveDropPlacement` on `onDrag` (reuse `dom-targets` geometry); no transition on marker
- [x] 8.7 Post-drop click suppression and table selection suppression during drag (parity with §4.21–4.22)
- [x] 8.8 `npm run build` (production bundle includes PdD); reload in `dev-obsidian` for smoke test
- [ ] 8.9 Re-run manual **§7** (especially 7.1, 7.2, 7.6 touch) after migration

## 7. Manual test plan (UI — apply verification)

- [ ] 7.1 Bases **table**: drag from **name/title column** reorders; **no** plugin handle; link drag does not steal gesture; **click name cell opens note**; **click property cell edits inline** without starting reorder; **no false multi-select highlight** except during an active drag; integers match display order after drop (**ASC** and **DESC** per view sort); **virtualized** rows update the correct files
- [ ] 7.2 Bases **list** and **gallery**: whole-item drag; **no** handles; tap opens note; link drag suppressed; reorder works in **ASC** and **DESC** like table
- [x] 7.7 **Gallery indicator (multi-row):** same-row gaps show **vertical** card-height bars; first card on each row shows **vertical** leading-edge bar (not full-width horizontal); row gaps show **horizontal** bars scoped to row width; indicator has **no** CSS transition
- [ ] 7.3 Manual edit `order` in source mode; confirm sort updates without plugin overwrite until next drag/renumber
- [ ] 7.4 Filtered base: reorder visible set only; hidden notes unchanged
- [ ] 7.5 Disable plugin; confirm frontmatter persists and Bases still sorts by property
- [ ] 7.6 **Mobile** (or touch emulation): whole-item reorder with long-press; tap still opens note; no handles

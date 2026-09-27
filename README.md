# Frontmatter Ordering

Obsidian community plugin that stores note sort order in frontmatter (default property `order`) and supports drag-and-drop reorder in native **Bases** table, list, and gallery views when the primary sort is that property (ascending or descending).

## Setup

1. Enable **Bases** (core plugin) and this plugin in **Settings → Community plugins**.
2. Add a **number** property (e.g. `order`) to your Base property list.
3. In each Bases view, set **Sort** to `order` **ascending** or **descending** (drag-reorder follows the view’s sort direction).
4. **Drag to reorder:** in **table** views, drag from the **file/name column**; in **list** and **gallery**, drag the whole row or card. A short movement starts reorder; **tap or click without dragging** still opens the note. Property cells in tables stay editable. Native **link drag** is disabled on eligible items. A **colored insertion line** shows the drop position.

Order values are **integers** `1`, `2`, `3`, … in the visible scope after a drag or renumber command. Order lives only in note YAML—not in `.base` files.

## Commands

| Command | ID |
|--------|-----|
| Fill missing order in folder | `fill-missing-order-in-folder` |
| Renumber order in folder | `renumber-order-in-folder` |
| Fill missing order in current Bases view | `fill-missing-order-in-bases-view` |
| Renumber order in current Bases view | `renumber-order-in-bases-view` |

**Fill** assigns the next integers after the current maximum in scope. **Renumber** writes `1..n` in display order (respecting ascending/descending setting).

## Settings

- **Order property name** (default `order`)
- **Default sort direction** — used by Renumber/Fill commands (Bases drag uses the view’s sort)
- **Missing order placement**, **Tie-breaker**, **Bases sort hint** (shows required property and **ascending** or **descending**)

## Interaction notes

- **Table:** drag from the name/title column only. **List/gallery:** whole-item drag (no separate grip).
- **Link drag** from Bases/Obsidian is suppressed on eligible items; use click/tap to open notes.
- **Grouped** Bases: reorder within one group only.
- **Touch:** long-press briefly, then drag to reorder.

## Limitations

- File explorer drag reorder is not implemented yet.
- DOM selectors may need updates when Obsidian changes Bases markup.

## Development

Vault: **`dev-obsidian`**.

```bash
npm install
npm run dev
npm run build
npm run lint
```

```bash
obsidian vault=dev-obsidian plugin:reload id=obsidian-frontmatter_ordering
```

### CLI examples

```bash
obsidian vault=dev-obsidian plugins:enabled filter=community
obsidian vault=dev-obsidian property:read name=order path="order_folder/1.md"
obsidian vault=dev-obsidian command id=obsidian-frontmatter_ordering:renumber-order-in-folder
obsidian vault=dev-obsidian base:query path="order_folder/base.base" format=json
obsidian vault=dev-obsidian dev:errors
```

After **renumber**, expect `order` values `1`, `2`, `3` (or reversed mapping when sort direction is descending).

### Manual checks

| Case | Expected |
|------|----------|
| Renumber scope of 3 notes | `order` is `1`, `2`, `3` (asc) or `3`, `2`, `1` (desc) |
| Fill missing with max `2` | Next missing notes get `3`, `4`, … |
| Drag row/card in Bases | Scope renumbered to integers; insertion line tracks pointer |
| Tap / click without drag | Note opens; no reorder |
| Wrong Bases sort | Hint names property and ascending/descending |

## License

0-BSD (see `package.json`).

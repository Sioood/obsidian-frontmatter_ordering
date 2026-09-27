import type { App, BasesEntry, BasesPropertyId, BasesView } from 'obsidian';
import { parsePropertyId, TFile } from 'obsidian';
import {
	fileIndexInResult,
	isGroupedBasesResult,
	markdownEntriesFromResult,
} from './context';
import { resolveFileForBasesItem } from './view-internals';

export type BasesDomViewKind = 'table' | 'list' | 'cards' | 'unknown';

/** Obsidian 1.13+ table body rows (not `.bases-thead`). */
export const BASES_TABLE_BODY_ROW_SELECTOR = '.bases-tbody .bases-tr';

export const BASES_ITEM_SELECTOR = [
	BASES_TABLE_BODY_ROW_SELECTOR,
	'.bases-cards-item',
	'.bases-list-item',
	'.bases-table-row',
	'tr.bases-table-row',
].join(', ');

export interface BasesDomGroup {
	groupEl: HTMLElement;
	itemEls: HTMLElement[];
	groupIndex: number;
}

const ITEM_SELECTORS: Record<BasesDomViewKind, string> = {
	table: BASES_TABLE_BODY_ROW_SELECTOR,
	list: '.bases-list-item',
	cards: '.bases-cards-item',
	unknown: BASES_ITEM_SELECTOR,
};

const GROUP_SELECTORS: Record<BasesDomViewKind, string> = {
	table: '.bases-tbody, .bases-table-group, .bases-group',
	list: '.bases-list-group, .bases-group',
	cards: '.bases-cards-group',
	unknown: '.bases-cards-group, .bases-list-group, .bases-table-group',
};

export function itemSelectorForKind(kind: BasesDomViewKind): string {
	return ITEM_SELECTORS[kind];
}

export function isTableDataRow(itemEl: HTMLElement): boolean {
	return (
		itemEl.classList.contains('bases-tr') &&
		!!itemEl.closest('.bases-tbody')
	);
}

const TABLE_NAME_PROPERTY_NAMES = new Set(['name', 'basename', 'title']);

/** Table rows drag from the file / note title column only (not property editors). */
export function isBasesTableNameColumnTd(td: HTMLElement): boolean {
	const propId = td.dataset.property;
	if (propId) {
		const parsed = parsePropertyId(propId as BasesPropertyId);
		if (
			(parsed.type === 'file' || parsed.type === 'note') &&
			TABLE_NAME_PROPERTY_NAMES.has(parsed.name)
		) {
			return true;
		}
	}
	return td.querySelector('a.internal-link') !== null;
}

export function findTableNameCellInRow(row: HTMLElement): HTMLElement | null {
	for (const td of Array.from(
		row.querySelectorAll<HTMLElement>('.bases-td'),
	)) {
		if (isBasesTableNameColumnTd(td)) {
			return td;
		}
	}
	return null;
}

export function shouldStartTableReorderPointer(
	evt: PointerEvent,
	itemEl: HTMLElement,
): boolean {
	const target = evt.target;
	if (!(target instanceof HTMLElement) || !itemEl.contains(target)) {
		return false;
	}
	if (
		target.closest(
			'input, textarea, select, button, [contenteditable="true"]',
		)
	) {
		return false;
	}
	if (target.closest('a.internal-link')) {
		return false;
	}
	const td = target.closest<HTMLElement>('.bases-td');
	if (!td) {
		return false;
	}
	return isBasesTableNameColumnTd(td);
}

/** Removes grip UI from an earlier handle-based build. */
export function removeLegacyDragHandles(containerEl: HTMLElement): void {
	containerEl
		.querySelectorAll(
			'.frontmatter-ordering-drag-handle, .frontmatter-ordering-drag-handle-td',
		)
		.forEach((el) => el.remove());
}

export function applyLinkDragSuppression(itemEl: HTMLElement): void {
	itemEl.setAttribute('draggable', 'false');
	itemEl.querySelectorAll('a, img').forEach((node) => {
		if (node instanceof HTMLElement) {
			node.setAttribute('draggable', 'false');
		}
	});
	if (itemEl.dataset.frontmatterOrderingDragBound !== '1') {
		itemEl.dataset.frontmatterOrderingDragBound = '1';
		itemEl.addEventListener('dragstart', (e) => {
			e.preventDefault();
			e.stopPropagation();
		});
	}
}

export function clearLinkDragSuppression(itemEl: HTMLElement): void {
	itemEl.removeAttribute('draggable');
	itemEl.querySelectorAll('a, img').forEach((node) => {
		if (node instanceof HTMLElement) {
			node.removeAttribute('draggable');
		}
	});
}

export function viewKindFromBasesView(view: BasesView): BasesDomViewKind {
	const type = view.type;
	if (type === 'table') {
		return 'table';
	}
	if (type === 'list') {
		return 'list';
	}
	if (type === 'cards' || type === 'gallery') {
		return 'cards';
	}
	return 'unknown';
}

/** Obsidian keeps off-screen layout probes in gallery (not real data groups). */
function isRenderableBasesGroup(groupEl: HTMLElement): boolean {
	if (groupEl.style.zIndex === '-1') {
		return false;
	}
	if (groupEl.style.pointerEvents === 'none') {
		return false;
	}
	return true;
}

export function findDomGroups(
	containerEl: HTMLElement,
	kind: BasesDomViewKind,
): BasesDomGroup[] {
	const groupSelector = GROUP_SELECTORS[kind];
	const itemSelector = ITEM_SELECTORS[kind];
	const groupEls = Array.from(
		containerEl.querySelectorAll<HTMLElement>(groupSelector),
	).filter(isRenderableBasesGroup);

	if (groupEls.length === 0) {
		const items = Array.from(
			containerEl.querySelectorAll<HTMLElement>(itemSelector),
		);
		if (items.length === 0) {
			return [];
		}
		return [{ groupEl: containerEl, itemEls: items, groupIndex: 0 }];
	}

	return groupEls.map((groupEl, index) => ({
		groupEl,
		itemEls: Array.from(groupEl.querySelectorAll<HTMLElement>(itemSelector)),
		groupIndex: index,
	}));
}

export interface ResolvedBasesItem {
	itemEl: HTMLElement;
	file: TFile;
	index: number;
	groupIndex: number;
	isGrouped: boolean;
}

/** Resolve the note for a Bases row/card from links (not DOM row index). */
export function resolveFileFromItemElement(
	app: App,
	itemEl: HTMLElement,
): TFile | null {
	const pathCandidates: string[] = [];
	const rowHref =
		itemEl.dataset.href ??
		itemEl.dataset.path ??
		itemEl.getAttribute('data-path');
	if (rowHref) {
		pathCandidates.push(rowHref);
	}
	itemEl.querySelectorAll('a').forEach((anchor) => {
		if (anchor.dataset.href) {
			pathCandidates.push(anchor.dataset.href);
		}
		const href = anchor.getAttribute('href');
		if (href && !href.startsWith('http')) {
			pathCandidates.push(href);
		}
	});
	pathCandidates.sort((a, b) => b.length - a.length);
	const seen = new Set<string>();
	for (const raw of pathCandidates) {
		const key = raw.trim();
		if (!key || seen.has(key)) {
			continue;
		}
		seen.add(key);
		const path = decodeURIComponent(key);
		const byPath = app.vault.getAbstractFileByPath(path);
		if (byPath instanceof TFile) {
			return byPath;
		}
		if (path.includes('/') || path.endsWith('.md')) {
			const dest = app.metadataCache.getFirstLinkpathDest(path, '');
			if (dest instanceof TFile) {
				return dest;
			}
		}
	}
	return null;
}

function fileFromGalleryCardLabel(
	entries: BasesEntry[],
	itemEl: HTMLElement,
): TFile | null {
	const label = itemEl.querySelector<HTMLElement>(
		'.mod-title .bases-cards-line, .bases-cards-property.mod-title .bases-cards-line',
	);
	const text = label?.textContent?.trim();
	if (!text) {
		return null;
	}
	const normalized = text.endsWith('.md') ? text : `${text}.md`;
	const matches = entries.filter(
		(e) => e.file?.basename === text || e.file?.basename === normalized,
	);
	if (matches.length !== 1 || !matches[0]?.file) {
		return null;
	}
	return matches[0].file;
}

function resolveItemWithIndex(
	basesView: BasesView,
	kind: BasesDomViewKind,
	itemEl: HTMLElement,
	locations: Map<string, { groupIndex: number; index: number }>,
	grouped: boolean,
): ResolvedBasesItem | null {
	if (kind === 'table' && !isTableDataRow(itemEl)) {
		return null;
	}
	let file = resolveFileForBasesItem(basesView, itemEl, (el) =>
		resolveFileFromItemElement(basesView.app, el),
	);
	if (!file && kind === 'cards') {
		for (let i = 0; i < basesView.data.groupedData.length; i++) {
			const labeled = fileFromGalleryCardLabel(
				markdownEntriesFromResult(basesView.data, i),
				itemEl,
			);
			if (labeled) {
				file = labeled;
				break;
			}
		}
	}
	if (!file) {
		return null;
	}
	const located = locations.get(file.path);
	if (!located) {
		return null;
	}
	return {
		itemEl,
		file,
		index: located.index,
		groupIndex: located.groupIndex,
		isGrouped: grouped,
	};
}

export function resolveBasesItem(
	containerEl: HTMLElement,
	basesView: BasesView,
	itemEl: HTMLElement,
): ResolvedBasesItem | null {
	const kind = viewKindFromBasesView(basesView);
	const groups = findDomGroups(containerEl, kind);
	if (!groups.some((group) => group.itemEls.includes(itemEl))) {
		return null;
	}
	return resolveItemWithIndex(
		basesView,
		kind,
		itemEl,
		fileIndexInResult(basesView.data),
		isGroupedBasesResult(basesView.data),
	);
}

/** One DOM scan + one entry index for every card/row in the dragged item's group. */
export function resolveItemsInSourceGroup(
	containerEl: HTMLElement,
	basesView: BasesView,
	sourceItemEl: HTMLElement,
): ResolvedBasesItem[] {
	const kind = viewKindFromBasesView(basesView);
	const groups = findDomGroups(containerEl, kind);
	const group = groups.find((candidate) =>
		candidate.itemEls.includes(sourceItemEl),
	);
	if (!group) {
		return [];
	}
	const locations = fileIndexInResult(basesView.data);
	const grouped = isGroupedBasesResult(basesView.data);
	const resolved: ResolvedBasesItem[] = [];
	for (const itemEl of group.itemEls) {
		const item = resolveItemWithIndex(
			basesView,
			kind,
			itemEl,
			locations,
			grouped,
		);
		if (item) {
			resolved.push(item);
		}
	}
	return resolved;
}

export function resolveBasesItemAtPoint(
	containerEl: HTMLElement,
	basesView: BasesView,
	clientX: number,
	clientY: number,
	ignoreEl?: HTMLElement | null,
	restrictToGroupEl?: HTMLElement | null,
): ResolvedBasesItem | null {
	const kind = viewKindFromBasesView(basesView);
	const itemSelector = itemSelectorForKind(kind);
	const hits = document.elementsFromPoint(clientX, clientY);
	for (const hit of hits) {
		if (!(hit instanceof HTMLElement)) {
			continue;
		}
		if (ignoreEl && (hit === ignoreEl || ignoreEl.contains(hit))) {
			continue;
		}
		const itemEl = hit.closest<HTMLElement>(itemSelector);
		if (!itemEl || !containerEl.contains(itemEl)) {
			continue;
		}
		if (restrictToGroupEl && !restrictToGroupEl.contains(itemEl)) {
			continue;
		}
		const resolved = resolveBasesItem(containerEl, basesView, itemEl);
		if (resolved) {
			return resolved;
		}
	}
	return null;
}

export function isPointInsideRect(
	clientX: number,
	clientY: number,
	rect: DOMRect,
): boolean {
	return (
		clientX >= rect.left &&
		clientX <= rect.right &&
		clientY >= rect.top &&
		clientY <= rect.bottom
	);
}

export interface DropPlacement {
	insertIndex: number;
	/** Insert slot 0..n used for hysteresis on the next frame. */
	slot: number;
	/** Viewport coordinates (for hit testing). */
	indicatorViewport: {
		left: number;
		top: number;
		width: number;
		height: number;
	};
}

type FlowAxis = 'vertical' | 'horizontal';

const INDICATOR_THICKNESS = 4;
const INDICATOR_INSET = 4;
const SLOT_HIT_SLOP = 12;
const SLOT_STICKY_BIAS = 0.78;

function globalInsertIndexFromVisibleSlot(
	visible: ResolvedBasesItem[],
	slot: number,
	fromIndex: number,
): number {
	if (visible.length === 0) {
		return 0;
	}
	let targetIndex: number;
	if (slot >= visible.length) {
		const lastVisible = visible[visible.length - 1];
		if (!lastVisible) {
			return 0;
		}
		targetIndex = lastVisible.index + 1;
	} else {
		const atSlot = visible[slot];
		if (!atSlot) {
			return Math.max(0, fromIndex);
		}
		targetIndex = atSlot.index;
	}
	let insert = targetIndex;
	if (fromIndex < insert) {
		insert -= 1;
	}
	return Math.max(0, insert);
}

function detectFlowAxis(
	kind: BasesDomViewKind,
	items: HTMLElement[],
): FlowAxis {
	if (kind === 'table' || kind === 'list') {
		return 'vertical';
	}
	if (items.length < 2) {
		return 'vertical';
	}
	const first = items[0];
	const second = items[1];
	if (!first || !second) {
		return 'vertical';
	}
	const a = first.getBoundingClientRect();
	const b = second.getBoundingClientRect();
	const sameRow = Math.abs(a.top - b.top) < Math.min(a.height, b.height) * 0.4;
	return sameRow ? 'horizontal' : 'vertical';
}

function itemsShareRow(a: DOMRect, b: DOMRect): boolean {
	return Math.abs(a.top - b.top) < Math.min(a.height, b.height) * 0.4;
}

/** Horizontal extent of every card that shares a row with `items[index]`. */
function rowBoundsForIndex(
	items: HTMLElement[],
	index: number,
): DOMRect | null {
	const anchorEl = items[index];
	if (!anchorEl) {
		return null;
	}
	const anchor = anchorEl.getBoundingClientRect();
	let left = anchor.left;
	let right = anchor.right;
	let top = anchor.top;
	let bottom = anchor.bottom;
	for (const item of items) {
		const rect = item.getBoundingClientRect();
		if (!itemsShareRow(anchor, rect)) {
			continue;
		}
		left = Math.min(left, rect.left);
		right = Math.max(right, rect.right);
		top = Math.min(top, rect.top);
		bottom = Math.max(bottom, rect.bottom);
	}
	return new DOMRect(left, top, right - left, bottom - top);
}

function unionBounds(items: HTMLElement[]): DOMRect | null {
	if (items.length === 0) {
		return null;
	}
	let left = Infinity;
	let top = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	for (const item of items) {
		const r = item.getBoundingClientRect();
		left = Math.min(left, r.left);
		top = Math.min(top, r.top);
		right = Math.max(right, r.right);
		bottom = Math.max(bottom, r.bottom);
	}
	return new DOMRect(left, top, right - left, bottom - top);
}

function distanceToRect(
	clientX: number,
	clientY: number,
	left: number,
	top: number,
	width: number,
	height: number,
): number {
	const dx = Math.max(left - clientX, 0, clientX - (left + width));
	const dy = Math.max(top - clientY, 0, clientY - (top + height));
	return Math.hypot(dx, dy);
}

function distanceToIndicator(
	clientX: number,
	clientY: number,
	indicator: DropPlacement['indicatorViewport'],
): number {
	return distanceToRect(
		clientX,
		clientY,
		indicator.left - SLOT_HIT_SLOP,
		indicator.top - SLOT_HIT_SLOP,
		indicator.width + SLOT_HIT_SLOP * 2,
		indicator.height + SLOT_HIT_SLOP * 2,
	);
}

/** Pick the insertion slot whose indicator is closest to the pointer (works for lists and multi-row grids). */
function slotFromClosestGap(
	items: HTMLElement[],
	clientX: number,
	clientY: number,
	axis: FlowAxis,
	kind: BasesDomViewKind,
	previousSlot?: number | null,
): number {
	if (items.length === 0) {
		return 0;
	}

	let bestSlot = 0;
	let bestDistance = Infinity;

	for (let slot = 0; slot <= items.length; slot++) {
		const indicator = indicatorForSlot(items, slot, axis, kind);
		let distance = distanceToIndicator(clientX, clientY, indicator);
		if (previousSlot === slot) {
			distance *= SLOT_STICKY_BIAS;
		}
		if (distance < bestDistance) {
			bestDistance = distance;
			bestSlot = slot;
		}
	}

	const bounds = unionBounds(items);
	if (bounds) {
		const pad = SLOT_HIT_SLOP;
		if (clientY < bounds.top - pad) {
			return 0;
		}
		if (clientY > bounds.bottom + pad) {
			return items.length;
		}
		if (kind === 'cards') {
			if (clientX < bounds.left - pad) {
				return 0;
			}
			if (clientX > bounds.right + pad) {
				return items.length;
			}
		}
	}

	return bestSlot;
}

/** When the pointer is over a card, split it (left/right on a row, top/bottom otherwise). */
function refineGallerySlotOverItem(
	items: HTMLElement[],
	clientX: number,
	clientY: number,
	fallbackSlot: number,
): number {
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (!item) {
			continue;
		}
		const rect = item.getBoundingClientRect();
		if (!isPointInsideRect(clientX, clientY, rect)) {
			continue;
		}
		const prev = items[i - 1];
		const next = items[i + 1];
		const prevRect = prev?.getBoundingClientRect();
		const nextRect = next?.getBoundingClientRect();
		const flowsHorizontally =
			(prevRect && itemsShareRow(rect, prevRect)) ||
			(nextRect && itemsShareRow(rect, nextRect));

		if (flowsHorizontally) {
			const midX = rect.left + rect.width / 2;
			return clientX < midX ? i : i + 1;
		}
		const midY = rect.top + rect.height / 2;
		return clientY < midY ? i : i + 1;
	}
	return fallbackSlot;
}

function refineLinearSlotOverItem(
	items: HTMLElement[],
	clientX: number,
	clientY: number,
	fallbackSlot: number,
): number {
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (!item) {
			continue;
		}
		const rect = item.getBoundingClientRect();
		if (!isPointInsideRect(clientX, clientY, rect)) {
			continue;
		}
		const midY = rect.top + rect.height / 2;
		return clientY < midY ? i : i + 1;
	}
	return fallbackSlot;
}

function pointerInVerticalRowGap(
	before: DOMRect,
	after: DOMRect,
	clientY: number,
): boolean {
	if (after.top <= before.bottom + 1) {
		return false;
	}
	return clientY > before.bottom - 2 && clientY < after.top + 2;
}

function indicatorForSlot(
	items: HTMLElement[],
	slot: number,
	axis: FlowAxis,
	kind: BasesDomViewKind,
	pointer?: { x: number; y: number } | null,
): DropPlacement['indicatorViewport'] {
	const thickness = INDICATOR_THICKNESS;
	const inset = INDICATOR_INSET;

	if (items.length === 0) {
		return { left: 0, top: 0, width: 0, height: 0 };
	}

	const firstItem = items[0];
	if (!firstItem) {
		return { left: 0, top: 0, width: 0, height: 0 };
	}

	if (slot <= 0) {
		const r = firstItem.getBoundingClientRect();
		if (kind === 'cards') {
			return {
				left: r.left - thickness / 2,
				top: r.top + inset,
				width: thickness,
				height: Math.max(24, r.height - inset * 2),
			};
		}
		return {
			left: r.left + inset,
			top: r.top - thickness / 2,
			width: Math.max(24, r.width - inset * 2),
			height: thickness,
		};
	}

	if (slot >= items.length) {
		const lastItem = items[items.length - 1];
		if (!lastItem) {
			return { left: 0, top: 0, width: 0, height: 0 };
		}
		const r = lastItem.getBoundingClientRect();
		if (kind === 'cards') {
			return {
				left: r.right - thickness / 2,
				top: r.top + inset,
				width: thickness,
				height: Math.max(24, r.height - inset * 2),
			};
		}
		return {
			left: r.left + inset,
			top: r.bottom - thickness / 2,
			width: Math.max(24, r.width - inset * 2),
			height: thickness,
		};
	}

	const beforeEl = items[slot - 1];
	const afterEl = items[slot];
	if (!beforeEl || !afterEl) {
		return { left: 0, top: 0, width: 0, height: 0 };
	}
	const before = beforeEl.getBoundingClientRect();
	const after = afterEl.getBoundingClientRect();

	if (kind === 'cards') {
		if (itemsShareRow(before, after)) {
			const x = (before.right + after.left) / 2;
			const top = Math.min(before.top, after.top) + inset;
			const bottom = Math.max(before.bottom, after.bottom) - inset;
			return {
				left: x - thickness / 2,
				top,
				width: thickness,
				height: Math.max(24, bottom - top),
			};
		}
		const y = (before.bottom + after.top) / 2;
		const inRowGap =
			pointer !== undefined &&
			pointer !== null &&
			pointerInVerticalRowGap(before, after, pointer.y);

		if (inRowGap) {
			const row =
				rowBoundsForIndex(items, slot - 1) ??
				rowBoundsForIndex(items, slot);
			if (row) {
				return {
					left: row.left + inset,
					top: y - thickness / 2,
					width: Math.max(24, row.width - inset * 2),
					height: thickness,
				};
			}
		}

		return {
			left: after.left - thickness / 2,
			top: after.top + inset,
			width: thickness,
			height: Math.max(24, after.height - inset * 2),
		};
	}

	if (axis === 'vertical') {
		const y = (before.bottom + after.top) / 2;
		const left = Math.min(before.left, after.left) + inset;
		const right = Math.max(before.right, after.right) - inset;
		return {
			left,
			top: y - thickness / 2,
			width: Math.max(24, right - left),
			height: thickness,
		};
	}
	const x = (before.right + after.left) / 2;
	const top = Math.min(before.top, after.top) + inset;
	const bottom = Math.max(before.bottom, after.bottom) - inset;
	return {
		left: x - thickness / 2,
		top,
		width: thickness,
		height: Math.max(24, bottom - top),
	};
}

export function resolveDropPlacement(
	containerEl: HTMLElement,
	basesView: BasesView,
	source: ResolvedBasesItem,
	clientX: number,
	clientY: number,
	previousSlot?: number | null,
): DropPlacement | null {
	const containerRect = containerEl.getBoundingClientRect();
	if (!isPointInsideRect(clientX, clientY, containerRect)) {
		return null;
	}

	const kind = viewKindFromBasesView(basesView);
	const visible = resolveItemsInSourceGroup(
		containerEl,
		basesView,
		source.itemEl,
	);
	const items = visible.map((item) => item.itemEl);
	if (items.length === 0) {
		return null;
	}

	const axis = detectFlowAxis(kind, items);
	let slot = slotFromClosestGap(
		items,
		clientX,
		clientY,
		axis,
		kind,
		previousSlot,
	);
	if (kind === 'cards') {
		slot = refineGallerySlotOverItem(items, clientX, clientY, slot);
	} else if (kind === 'table' || kind === 'list') {
		slot = refineLinearSlotOverItem(items, clientX, clientY, slot);
	}
	const insertIndex = globalInsertIndexFromVisibleSlot(
		visible,
		slot,
		source.index,
	);
	const indicatorViewport = indicatorForSlot(items, slot, axis, kind, {
		x: clientX,
		y: clientY,
	});

	return { insertIndex, indicatorViewport, slot };
}

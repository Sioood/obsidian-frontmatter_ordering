import type { BasesEntry, BasesView } from 'obsidian';
import { TFile } from 'obsidian';

const PATH_DATASET = 'frontmatterOrderingPath';

/** Row/card component reused by Obsidian Bases virtual scrolling (undocumented). */
interface BasesRowComponent {
	el: HTMLElement;
	entry?: BasesEntry;
}

interface BasesViewWithRowPools extends BasesView {
	rows?: BasesRowComponent[];
	unusedRows?: BasesRowComponent[];
	groups?: Array<{ rows?: BasesRowComponent[] }>;
	items?: BasesRowComponent[];
	unusedItems?: BasesRowComponent[];
}

function rowHostsFromView(view: BasesView): BasesRowComponent[] {
	const internal = view as BasesViewWithRowPools;
	const hosts: BasesRowComponent[] = [];
	for (const row of internal.rows ?? []) {
		hosts.push(row);
	}
	for (const row of internal.unusedRows ?? []) {
		hosts.push(row);
	}
	for (const group of internal.groups ?? []) {
		for (const row of group.rows ?? []) {
			hosts.push(row);
		}
	}
	for (const row of internal.items ?? []) {
		hosts.push(row);
	}
	for (const row of internal.unusedItems ?? []) {
		hosts.push(row);
	}
	return hosts;
}

function itemRootForRowLookup(itemEl: HTMLElement): HTMLElement {
	return (
		itemEl.closest<HTMLElement>('.bases-tr, .bases-list-item, .bases-cards-item') ??
		itemEl
	);
}

export function setCachedItemFilePath(itemEl: HTMLElement, path: string): void {
	itemRootForRowLookup(itemEl).dataset[PATH_DATASET] = path;
}

export function clearCachedItemFilePath(itemEl: HTMLElement): void {
	delete itemRootForRowLookup(itemEl).dataset[PATH_DATASET];
}

function fileFromCachedPath(itemEl: HTMLElement, app: BasesView['app']): TFile | null {
	const root = itemRootForRowLookup(itemEl);
	const path = root.dataset[PATH_DATASET];
	if (!path) {
		return null;
	}
	const file = app.vault.getAbstractFileByPath(path);
	return file instanceof TFile && file.extension === 'md' ? file : null;
}

/** Resolve file from Bases view row pools (required when the table/list is virtualized). */
export function resolveFileFromBasesViewInternals(
	basesView: BasesView,
	itemEl: HTMLElement,
): TFile | null {
	const root = itemRootForRowLookup(itemEl);
	for (const host of rowHostsFromView(basesView)) {
		if (host.el !== root) {
			continue;
		}
		const file = host.entry?.file;
		if (file?.extension === 'md') {
			return file;
		}
	}
	return null;
}

export function resolveFileForBasesItem(
	basesView: BasesView,
	itemEl: HTMLElement,
	linkResolver: (el: HTMLElement) => TFile | null,
): TFile | null {
	return (
		resolveFileFromBasesViewInternals(basesView, itemEl) ??
		fileFromCachedPath(itemEl, basesView.app) ??
		linkResolver(itemEl)
	);
}

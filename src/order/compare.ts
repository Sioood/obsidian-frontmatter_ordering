import type { App, TFile } from 'obsidian';
import type { FrontmatterOrderingSettings } from '../settings';
import { orderSortKey } from './parse';

export function compareFilesByOrder(
	app: App,
	settings: FrontmatterOrderingSettings,
	a: TFile,
	b: TFile,
): number {
	const keyA = orderSortKey(app, a, settings);
	const keyB = orderSortKey(app, b, settings);
	let cmp = keyA - keyB;
	if (settings.sortDirection === 'desc') {
		cmp = -cmp;
	}
	if (cmp !== 0) {
		return cmp;
	}
	return compareTieBreaker(settings.tieBreaker, a, b);
}

function compareTieBreaker(
	field: FrontmatterOrderingSettings['tieBreaker'],
	a: TFile,
	b: TFile,
): number {
	const left = field === 'basename' ? a.basename : a.path;
	const right = field === 'basename' ? b.basename : b.path;
	return left.localeCompare(right, undefined, { numeric: true });
}

export function sortFilesByOrder(
	app: App,
	settings: FrontmatterOrderingSettings,
	files: TFile[],
): TFile[] {
	return [...files].sort((a, b) => compareFilesByOrder(app, settings, a, b));
}

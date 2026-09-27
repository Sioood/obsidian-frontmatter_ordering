import type { App, TFile } from 'obsidian';
import type { FrontmatterOrderingSettings, SortDirection } from '../settings';
import { writeOrderForFiles } from './write';

export function sequentialOrders(
	count: number,
	direction: SortDirection,
): number[] {
	if (count <= 0) {
		return [];
	}
	const ascending = Array.from({ length: count }, (_, i) => i + 1);
	if (direction === 'asc') {
		return ascending;
	}
	return ascending.reverse();
}

export async function renumberFilesInOrder(
	app: App,
	settings: FrontmatterOrderingSettings,
	filesInDisplayOrder: TFile[],
	displayDirection?: SortDirection,
): Promise<{ failed: TFile[] }> {
	const values = sequentialOrders(
		filesInDisplayOrder.length,
		displayDirection ?? settings.sortDirection,
	);
	const entries = filesInDisplayOrder.map((file, i) => ({
		file,
		value: values[i] ?? i + 1,
	}));
	return writeOrderForFiles(app, settings.orderPropertyName, entries);
}

export async function assignOrderAfterMove(
	app: App,
	settings: FrontmatterOrderingSettings,
	filesInDisplayOrder: TFile[],
	fromIndex: number,
	toIndex: number,
	displayDirection?: SortDirection,
): Promise<{ failed: TFile[] }> {
	if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
		return { failed: [] };
	}
	const reordered = [...filesInDisplayOrder];
	const [moved] = reordered.splice(fromIndex, 1);
	if (!moved) {
		return { failed: [] };
	}
	reordered.splice(toIndex, 0, moved);
	return renumberFilesInOrder(app, settings, reordered, displayDirection);
}

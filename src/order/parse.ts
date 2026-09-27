import type { App, TFile } from 'obsidian';
import type {
	FrontmatterOrderingSettings,
	MissingOrderPlacement,
} from '../settings';

export type OrderParseResult =
	| { kind: 'valid'; value: number }
	| { kind: 'missing' }
	| { kind: 'invalid' };

export function parseOrderFromCache(
	app: App,
	file: TFile,
	propertyName: string,
): OrderParseResult {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!frontmatter || !(propertyName in frontmatter)) {
		return { kind: 'missing' };
	}
	const raw: unknown = frontmatter[propertyName];
	let value: number;
	if (typeof raw === 'number') {
		value = raw;
	} else if (typeof raw === 'string') {
		value = Number(raw.trim());
	} else {
		value = Number(raw);
	}
	if (!Number.isFinite(value)) {
		return { kind: 'invalid' };
	}
	return { kind: 'valid', value };
}

/** Sort key for comparison; missing/invalid use placement policy. */
export function orderSortKey(
	app: App,
	file: TFile,
	settings: Pick<
		FrontmatterOrderingSettings,
		'orderPropertyName' | 'missingOrderPlacement' | 'sortDirection'
	>,
): number {
	const parsed = parseOrderFromCache(app, file, settings.orderPropertyName);
	if (parsed.kind === 'valid') {
		return parsed.value;
	}
	const placement = settings.missingOrderPlacement;
	const asc = settings.sortDirection === 'asc';
	if (placement === 'first') {
		return asc ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
	}
	return asc ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
}

export function missingPlacementLabel(
	placement: MissingOrderPlacement,
): string {
	return placement === 'first' ? 'before explicit orders' : 'after explicit orders';
}

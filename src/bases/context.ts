import type {
	BasesEntry,
	BasesQueryResult,
	BasesSortConfig,
	BasesView,
	BasesViewConfig,
	View,
	WorkspaceLeaf,
} from 'obsidian';
import { parsePropertyId } from 'obsidian';
import type {
	FrontmatterOrderingSettings,
	SortDirection,
} from '../settings';

export interface BasesQueryControllerLike {
	view: BasesView;
	viewContainerEl: HTMLElement;
	getViewConfig(): BasesViewConfig;
}

export interface BasesLeafViewLike extends View {
	controller?: BasesQueryControllerLike;
}

export function isBasesCoreEnabled(app: import('obsidian').App): boolean {
	const internal = app as import('obsidian').App & {
		internalPlugins?: {
			getPluginById: (id: string) => { enabled: boolean } | null;
		};
	};
	return internal.internalPlugins?.getPluginById('bases')?.enabled === true;
}

export function getActiveBasesLeaf(
	workspace: import('obsidian').Workspace,
): WorkspaceLeaf | null {
	const recent = workspace.getMostRecentLeaf();
	if (recent?.view.getViewType() === 'bases') {
		return recent;
	}
	const leaves = workspace.getLeavesOfType('bases');
	return leaves[0] ?? null;
}

export function getBasesContextFromLeaf(leaf: WorkspaceLeaf): {
	basesView: BasesView;
	containerEl: HTMLElement;
	config: BasesViewConfig;
} | null {
	const view = leaf.view as BasesLeafViewLike;
	const controller = view.controller;
	if (!controller?.view || !controller.viewContainerEl) {
		return null;
	}
	return {
		basesView: controller.view,
		containerEl: controller.viewContainerEl,
		config: controller.getViewConfig(),
	};
}

export function primaryOrderSort(
	config: BasesViewConfig,
	settings: FrontmatterOrderingSettings,
): BasesSortConfig | null {
	const primary = config.getSort()[0];
	if (!primary) {
		return null;
	}
	const parsed = parsePropertyId(primary.property);
	if (
		parsed.type !== 'note' ||
		parsed.name !== settings.orderPropertyName
	) {
		return null;
	}
	return primary;
}

export function sortDirectionFromBasesSort(
	primary: BasesSortConfig,
): SortDirection {
	return primary.direction === 'DESC' ? 'desc' : 'asc';
}

export function reorderSortDirectionFromConfig(
	config: BasesViewConfig,
	settings: FrontmatterOrderingSettings,
): SortDirection | null {
	const primary = primaryOrderSort(config, settings);
	if (!primary) {
		return null;
	}
	return sortDirectionFromBasesSort(primary);
}

export function getBasesSortHintMessage(
	_config: BasesViewConfig,
	settings: FrontmatterOrderingSettings,
): string {
	const name = settings.orderPropertyName;
	return `Sort by ${name} (ascending or descending) to drag-reorder.`;
}

export function isSortEligibleForReorder(
	config: BasesViewConfig,
	settings: FrontmatterOrderingSettings,
): boolean {
	return primaryOrderSort(config, settings) !== null;
}

export function isGroupedBasesResult(result: BasesQueryResult): boolean {
	return result.groupedData.length > 1;
}

function markdownEntriesForGroup(
	result: BasesQueryResult,
	groupIndex: number,
): BasesEntry[] {
	const group = result.groupedData[groupIndex];
	return (group?.entries ?? []).filter((e) => e.file?.extension === 'md');
}

/** Entries in display order for a group (matches what Bases renders, including when virtualized). */
export function markdownEntriesFromResult(
	result: BasesQueryResult,
	groupIndex?: number,
): BasesEntry[] {
	if (groupIndex !== undefined) {
		return markdownEntriesForGroup(result, groupIndex);
	}
	if (result.groupedData.length === 1) {
		return markdownEntriesForGroup(result, 0);
	}
	return result.data.filter((e) => e.file?.extension === 'md');
}

export function filesFromEntries(entries: BasesEntry[]): import('obsidian').TFile[] {
	return entries.map((e) => e.file).filter((f): f is import('obsidian').TFile => !!f);
}

/** Markdown entry position in `groupedData`, matching `markdownEntriesFromResult`. */
export function fileIndexInResult(
	result: BasesQueryResult,
): Map<string, { groupIndex: number; index: number }> {
	const index = new Map<string, { groupIndex: number; index: number }>();
	for (let groupIndex = 0; groupIndex < result.groupedData.length; groupIndex++) {
		const group = result.groupedData[groupIndex];
		if (!group) {
			continue;
		}
		let entryIndex = 0;
		for (const entry of group.entries) {
			const file = entry.file;
			if (file?.extension !== 'md') {
				continue;
			}
			index.set(file.path, { groupIndex, index: entryIndex });
			entryIndex += 1;
		}
	}
	return index;
}

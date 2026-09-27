import { Notice, type App } from 'obsidian';
import { renumberFilesInOrder } from '../order/assign';
import { sortFilesByOrder } from '../order/compare';
import type { FrontmatterOrderingSettings } from '../settings';
import {
	filesFromEntries,
	getActiveBasesLeaf,
	getBasesContextFromLeaf,
	markdownEntriesFromResult,
} from '../bases/context';
import {
	markdownFilesInFolder,
	resolveTargetFolder,
} from '../utils/folder-scope';

export async function renumberOrderInFolder(
	app: App,
	settings: FrontmatterOrderingSettings,
): Promise<void> {
	const folder = resolveTargetFolder(app);
	if (!folder) {
		new Notice('Frontmatter ordering: open a note or select a folder.');
		return;
	}
	const files = sortFilesByOrder(
		app,
		settings,
		markdownFilesInFolder(folder),
	);
	await renumberScope(app, settings, files);
}

export async function renumberOrderInBasesView(
	app: App,
	settings: FrontmatterOrderingSettings,
): Promise<void> {
	const leaf = getActiveBasesLeaf(app.workspace);
	const ctx = leaf ? getBasesContextFromLeaf(leaf) : null;
	if (!ctx) {
		new Notice('Frontmatter ordering: focus a Bases view first.');
		return;
	}
	const entries = markdownEntriesFromResult(ctx.basesView.data);
	const files = filesFromEntries(entries);
	await renumberScope(app, settings, files);
}

async function renumberScope(
	app: App,
	settings: FrontmatterOrderingSettings,
	filesInDisplayOrder: import('obsidian').TFile[],
): Promise<void> {
	if (filesInDisplayOrder.length === 0) {
		new Notice('Frontmatter ordering: no Markdown files in scope.');
		return;
	}
	const { failed } = await renumberFilesInOrder(
		app,
		settings,
		filesInDisplayOrder,
	);
	if (failed.length > 0) {
		new Notice(
			`Frontmatter ordering: renumbered ${filesInDisplayOrder.length - failed.length}; ${failed.length} failed.`,
		);
		return;
	}
	new Notice(
		`Frontmatter ordering: renumbered ${filesInDisplayOrder.length} note(s).`,
	);
}

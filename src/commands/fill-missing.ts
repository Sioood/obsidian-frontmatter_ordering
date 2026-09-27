import { Notice, type App, type TFile } from 'obsidian';
import { sortFilesByOrder } from '../order/compare';
import { parseOrderFromCache } from '../order/parse';
import { writeOrderForFiles } from '../order/write';
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

export async function fillMissingOrderInFolder(
	app: App,
	settings: FrontmatterOrderingSettings,
): Promise<void> {
	const folder = resolveTargetFolder(app);
	if (!folder) {
		new Notice('Frontmatter ordering: open a note or select a folder.');
		return;
	}
	const files = markdownFilesInFolder(folder);
	await fillMissingOnFiles(app, settings, files);
}

export async function fillMissingOrderInBasesView(
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
	await fillMissingOnFiles(app, settings, files);
}

async function fillMissingOnFiles(
	app: App,
	settings: FrontmatterOrderingSettings,
	files: TFile[],
): Promise<void> {
	const sorted = sortFilesByOrder(app, settings, files);
	const missing = sorted.filter(
		(f) =>
			parseOrderFromCache(app, f, settings.orderPropertyName).kind !==
			'valid',
	);
	if (missing.length === 0) {
		new Notice('Frontmatter ordering: no missing order values in scope.');
		return;
	}

	const maxExisting = sorted
		.map((f) => parseOrderFromCache(app, f, settings.orderPropertyName))
		.filter((p) => p.kind === 'valid')
		.reduce((m, p) => Math.max(m, p.value), 0);

	let next = maxExisting;
	const entries = missing.map((file) => {
		next += 1;
		return { file, value: next };
	});

	const { failed } = await writeOrderForFiles(
		app,
		settings.orderPropertyName,
		entries,
	);
	if (failed.length > 0) {
		new Notice(
			`Frontmatter ordering: filled ${entries.length - failed.length} notes; ${failed.length} failed.`,
		);
		return;
	}
	new Notice(
		`Frontmatter ordering: filled order on ${entries.length} note(s).`,
	);
}

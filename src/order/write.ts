import type { App, TFile } from 'obsidian';

export async function writeOrderProperty(
	app: App,
	file: TFile,
	propertyName: string,
	value: number,
): Promise<void> {
	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		frontmatter[propertyName] = value;
	});
}

export async function writeOrderForFiles(
	app: App,
	propertyName: string,
	entries: { file: TFile; value: number }[],
): Promise<{ failed: TFile[] }> {
	const failed: TFile[] = [];
	for (const { file, value } of entries) {
		try {
			await writeOrderProperty(app, file, propertyName, value);
		} catch {
			failed.push(file);
		}
	}
	return { failed };
}

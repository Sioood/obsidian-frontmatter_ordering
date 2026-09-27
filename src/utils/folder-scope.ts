import { TFile, TFolder, type App } from 'obsidian';

export function resolveTargetFolder(app: App): TFolder | null {
	const active = app.workspace.getActiveFile();
	if (active?.parent) {
		return active.parent;
	}

	const selected = document.querySelector(
		'.tree-item.is-selected[data-path], .nav-folder.is-selected[data-path]',
	);
	const path = selected?.getAttribute('data-path');
	if (path) {
		const folder = app.vault.getFolderByPath(path);
		if (folder) {
			return folder;
		}
	}

	return null;
}

export function markdownFilesInFolder(folder: TFolder): TFile[] {
	const files: TFile[] = [];
	const stack: TFolder[] = [folder];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}
		for (const child of current.children) {
			if (child instanceof TFile) {
				if (child.extension === 'md') {
					files.push(child);
				}
			} else if (child instanceof TFolder) {
				stack.push(child);
			}
		}
	}
	return files;
}

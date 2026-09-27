import type FrontmatterOrderingPlugin from '../main';
import {
	fillMissingOrderInBasesView,
	fillMissingOrderInFolder,
} from './fill-missing';
import { renumberOrderInBasesView, renumberOrderInFolder } from './renumber';

export function registerCommands(plugin: FrontmatterOrderingPlugin): void {
	plugin.addCommand({
		id: 'fill-missing-order-in-folder',
		name: 'Fill missing order in folder',
		callback: () =>
			fillMissingOrderInFolder(plugin.app, plugin.settings),
	});

	plugin.addCommand({
		id: 'renumber-order-in-folder',
		name: 'Renumber order in folder',
		callback: () => renumberOrderInFolder(plugin.app, plugin.settings),
	});

	plugin.addCommand({
		id: 'renumber-order-in-bases-view',
		name: 'Renumber order in current Bases view',
		checkCallback: (checking) => {
			const hasBases =
				plugin.app.workspace.getLeavesOfType('bases').length > 0;
			if (!checking && hasBases) {
				void renumberOrderInBasesView(plugin.app, plugin.settings);
			}
			return hasBases;
		},
	});

	plugin.addCommand({
		id: 'fill-missing-order-in-bases-view',
		name: 'Fill missing order in current Bases view',
		checkCallback: (checking) => {
			const hasBases =
				plugin.app.workspace.getLeavesOfType('bases').length > 0;
			if (!checking && hasBases) {
				void fillMissingOrderInBasesView(plugin.app, plugin.settings);
			}
			return hasBases;
		},
	});
}

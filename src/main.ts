import { Plugin } from 'obsidian';
import { BasesReorderController } from './bases/reorder-controller';
import { isBasesCoreEnabled } from './bases/context';
import { registerCommands } from './commands';
import {
	DEFAULT_SETTINGS,
	FrontmatterOrderingSettingTab,
	type FrontmatterOrderingSettings,
} from './settings';

export default class FrontmatterOrderingPlugin extends Plugin {
	settings!: FrontmatterOrderingSettings;
	private basesReorder: BasesReorderController | null = null;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new FrontmatterOrderingSettingTab(this.app, this));
		registerCommands(this);

		if (isBasesCoreEnabled(this.app)) {
			this.basesReorder = new BasesReorderController(
				this.app,
				() => this.settings,
			);
			this.basesReorder.start();
			this.registerEvent(
				this.app.workspace.on('layout-change', () => {
					this.basesReorder?.scheduleAttach();
				}),
			);
			this.registerEvent(
				this.app.workspace.on('active-leaf-change', () => {
					this.basesReorder?.scheduleAttach();
				}),
			);
		}
	}

	onunload() {
		this.basesReorder?.stop();
		this.basesReorder = null;
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<FrontmatterOrderingSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.basesReorder?.scheduleAttach();
	}
}

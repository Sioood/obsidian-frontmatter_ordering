import { App, PluginSettingTab, Setting } from 'obsidian';
import type FrontmatterOrderingPlugin from './main';

export type SortDirection = 'asc' | 'desc';
export type MissingOrderPlacement = 'first' | 'last';
export type TieBreakerField = 'path' | 'basename';

export interface FrontmatterOrderingSettings {
	orderPropertyName: string;
	sortDirection: SortDirection;
	missingOrderPlacement: MissingOrderPlacement;
	tieBreaker: TieBreakerField;
	showBasesSortHint: boolean;
	defaultBasesReorderMode: boolean;
}

export const DEFAULT_SETTINGS: FrontmatterOrderingSettings = {
	orderPropertyName: 'order',
	sortDirection: 'asc',
	missingOrderPlacement: 'last',
	tieBreaker: 'path',
	showBasesSortHint: true,
	defaultBasesReorderMode: true,
};

export class FrontmatterOrderingSettingTab extends PluginSettingTab {
	plugin: FrontmatterOrderingPlugin;

	constructor(app: App, plugin: FrontmatterOrderingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Order property name')
			.setDesc('Frontmatter key used for sort order (default: order).')
			.addText((text) =>
				text
					.setPlaceholder('order')
					.setValue(this.plugin.settings.orderPropertyName)
					.onChange(async (value) => {
						this.plugin.settings.orderPropertyName =
							value.trim() || DEFAULT_SETTINGS.orderPropertyName;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Default sort direction')
			.setDesc(
				'Used by Renumber/Fill commands. Bases drag-reorder uses the view’s current sort direction (asc or desc).',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('asc', 'Ascending')
					.addOption('desc', 'Descending')
					.setValue(this.plugin.settings.sortDirection)
					.onChange(async (value) => {
						this.plugin.settings.sortDirection = value as SortDirection;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Missing order placement')
			.setDesc('Where notes without a valid order value sort.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('first', 'First')
					.addOption('last', 'Last')
					.setValue(this.plugin.settings.missingOrderPlacement)
					.onChange(async (value) => {
						this.plugin.settings.missingOrderPlacement =
							value as MissingOrderPlacement;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Tie-breaker')
			.setDesc('When order values tie, sort by this field.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('path', 'Path')
					.addOption('basename', 'File name')
					.setValue(this.plugin.settings.tieBreaker)
					.onChange(async (value) => {
						this.plugin.settings.tieBreaker = value as TieBreakerField;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Bases sort hint')
			.setDesc(
				'Show a hint when the active Bases view is not sorted by the order property.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showBasesSortHint)
					.onChange(async (value) => {
						this.plugin.settings.showBasesSortHint = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Default Bases reorder mode')
			.setDesc(
				'When a Bases view opens, start with the toolbar reorder toggle on (drag to reorder) or off (normal sidebar swipes on mobile).',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.defaultBasesReorderMode)
					.onChange(async (value) => {
						this.plugin.settings.defaultBasesReorderMode = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}

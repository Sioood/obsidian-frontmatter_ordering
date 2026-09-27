import { Notice, type App, type BasesView, type WorkspaceLeaf } from 'obsidian';
import type { FrontmatterOrderingSettings } from '../settings';
import { assignOrderAfterMove } from '../order/assign';
import {
	filesFromEntries,
	getBasesContextFromLeaf,
	getBasesSortHintMessage,
	isSortEligibleForReorder,
	markdownEntriesFromResult,
	reorderSortDirectionFromConfig,
} from './context';
import {
	applyLinkDragSuppression,
	clearLinkDragSuppression,
	itemSelectorForKind,
	removeLegacyDragHandles,
	type ResolvedBasesItem,
	resolveBasesItem,
	resolveDropPlacement,
	shouldStartTableReorderPointer,
	viewKindFromBasesView,
} from './dom-targets';
import {
	clearCachedItemFilePath,
	setCachedItemFilePath,
} from './view-internals';
import type { BasesViewConfig } from 'obsidian';

const DEBOUNCE_MS = 160;
const HINT_CLASS = 'frontmatter-ordering-bases-hint';
const DRAGGING_CLASS = 'frontmatter-ordering-dragging';
const INSERT_INDICATOR_CLASS = 'frontmatter-ordering-insert-indicator';
const REORDER_ACTIVE_CLASS = 'frontmatter-ordering-reorder-active';
const DRAG_OVERLAY_CLASS = 'frontmatter-ordering-drag-overlay';
const MOVE_THRESHOLD_PX = 4;
const LONG_PRESS_MS = 180;
const CLICK_SUPPRESS_MS = 650;

interface ContainerContext {
	containerEl: HTMLElement;
	basesView: BasesView;
	config: BasesViewConfig;
}

interface ActiveGesture {
	container: ContainerContext;
	source: ResolvedBasesItem;
	pointerId: number;
	startX: number;
	startY: number;
	startedAt: number;
	dragging: boolean;
	isTouch: boolean;
	pendingInsertIndex: number | null;
	pendingSlot: number | null;
}

export class BasesReorderController {
	private readonly containerObservers = new WeakMap<
		HTMLElement,
		MutationObserver
	>();
	private readonly boundContainers = new WeakSet<HTMLElement>();
	private readonly boundLeafRoots = new WeakSet<HTMLElement>();
	private readonly lastSyncedViewKey = new WeakMap<HTMLElement, string>();
	private debounceTimer: number | null = null;
	private gesture: ActiveGesture | null = null;
	private insertIndicatorEl: HTMLElement | null = null;
	private suppressClickUntil = 0;
	private clickSuppressBlockersActive = false;
	private clickSuppressReleaseTimer: number | null = null;
	private reorderActiveContainer: HTMLElement | null = null;
	private dragOverlayEl: HTMLElement | null = null;
	private indicatorRaf = 0;
	private pendingIndicatorCoords: { x: number; y: number } | null = null;
	private tableDragGuardsActive = false;

	constructor(
		private app: App,
		private getSettings: () => FrontmatterOrderingSettings,
	) {}

	start(): void {
		this.scheduleAttach();
	}

	stop(): void {
		this.detachClickSuppressBlockers();
		this.detachTableDragGuards();
		this.removeDragOverlay();
		this.deactivateReorderActiveContainer();
		this.endGesture();
		for (const leaf of this.app.workspace.getLeavesOfType('bases')) {
			const ctx = getBasesContextFromLeaf(leaf);
			if (ctx) {
				this.containerObservers.get(ctx.containerEl)?.disconnect();
				removeLegacyDragHandles(ctx.containerEl);
				this.clearItemsInContainer(ctx);
			}
		}
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
		}
		if (this.clickSuppressReleaseTimer !== null) {
			window.clearTimeout(this.clickSuppressReleaseTimer);
			this.clickSuppressReleaseTimer = null;
		}
		document.querySelectorAll(`.${HINT_CLASS}`).forEach((el) => el.remove());
		document
			.querySelectorAll(`.${INSERT_INDICATOR_CLASS}`)
			.forEach((el) => el.remove());
	}

	scheduleAttach(): void {
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = window.setTimeout(() => {
			this.debounceTimer = null;
			this.attachAllBasesViews();
		}, DEBOUNCE_MS);
	}

	private attachAllBasesViews(): void {
		const leaves = this.app.workspace.getLeavesOfType('bases');
		for (const leaf of leaves) {
			const ctx = getBasesContextFromLeaf(leaf);
			if (!ctx) {
				continue;
			}
			this.bindBasesLeaf(leaf);
			this.bindContainer(ctx.containerEl);
			this.watchContainer(ctx.containerEl);
			const containerCtx: ContainerContext = {
				containerEl: ctx.containerEl,
				basesView: ctx.basesView,
				config: ctx.config,
			};
			this.updateHint(containerCtx.containerEl, containerCtx.config);
			this.syncReorderableItems(containerCtx);
			this.lastSyncedViewKey.set(
				containerCtx.containerEl,
				this.viewSyncKey(containerCtx),
			);
		}
	}

	private viewSyncKey(ctx: ContainerContext): string {
		return `${ctx.basesView.type}:${ctx.config.name}`;
	}

	/** Re-bind items immediately after switching Bases view tabs (before debounced attach). */
	private ensureViewSynced(ctx: ContainerContext): void {
		const key = this.viewSyncKey(ctx);
		if (this.lastSyncedViewKey.get(ctx.containerEl) === key) {
			return;
		}
		this.lastSyncedViewKey.set(ctx.containerEl, key);
		this.updateHint(ctx.containerEl, ctx.config);
		this.syncReorderableItems(ctx);
	}

	private bindBasesLeaf(leaf: WorkspaceLeaf): void {
		const root = leaf.view.containerEl;
		if (this.boundLeafRoots.has(root)) {
			return;
		}
		this.boundLeafRoots.add(root);
		root.addEventListener(
			'click',
			() => {
				this.scheduleAttach();
			},
			{ capture: true },
		);
	}

	private refreshGestureContext(gesture: ActiveGesture): void {
		const fresh = this.contextForContainer(gesture.container.containerEl);
		if (fresh) {
			gesture.container = fresh;
		}
	}

	private contextForContainer(
		containerEl: HTMLElement,
	): ContainerContext | null {
		for (const leaf of this.app.workspace.getLeavesOfType('bases')) {
			const ctx = getBasesContextFromLeaf(leaf);
			if (ctx?.containerEl === containerEl) {
				return {
					containerEl: ctx.containerEl,
					basesView: ctx.basesView,
					config: ctx.config,
				};
			}
		}
		return null;
	}

	private bindContainer(containerEl: HTMLElement): void {
		if (this.boundContainers.has(containerEl)) {
			return;
		}
		this.boundContainers.add(containerEl);

		containerEl.addEventListener(
			'pointerdown',
			(evt) => this.onContainerPointerDown(containerEl, evt),
			{ capture: true },
		);
		containerEl.addEventListener(
			'dragstart',
			(evt) => this.onContainerDragStart(containerEl, evt),
			{ capture: true },
		);
	}

	private onContainerDragStart(
		containerEl: HTMLElement,
		evt: DragEvent,
	): void {
		const ctx = this.contextForContainer(containerEl);
		if (!ctx) {
			return;
		}
		if (!isSortEligibleForReorder(ctx.config, this.getSettings())) {
			return;
		}
		if (!(evt.target instanceof HTMLElement)) {
			return;
		}
		const kind = viewKindFromBasesView(ctx.basesView);
		const itemEl = evt.target.closest<HTMLElement>(
			itemSelectorForKind(kind),
		);
		if (!itemEl || !ctx.containerEl.contains(itemEl)) {
			return;
		}
		evt.preventDefault();
		evt.stopPropagation();
	}

	private onContainerPointerDown(
		containerEl: HTMLElement,
		evt: PointerEvent,
	): void {
		const ctx = this.contextForContainer(containerEl);
		if (!ctx) {
			return;
		}
		this.ensureViewSynced(ctx);
		if (evt.button !== 0 && evt.pointerType === 'mouse') {
			return;
		}
		if (!isSortEligibleForReorder(ctx.config, this.getSettings())) {
			return;
		}
		if (!(evt.target instanceof HTMLElement)) {
			return;
		}
		const kind = viewKindFromBasesView(ctx.basesView);
		const itemEl = evt.target.closest<HTMLElement>(
			itemSelectorForKind(kind),
		);
		if (!itemEl || !ctx.containerEl.contains(itemEl)) {
			return;
		}
		const source = resolveBasesItem(ctx.containerEl, ctx.basesView, itemEl);
		if (!source) {
			return;
		}
		if (
			kind === 'table' &&
			!shouldStartTableReorderPointer(evt, itemEl)
		) {
			return;
		}
		if (kind === 'table') {
			evt.stopImmediatePropagation();
		}
		this.beginGesture(ctx, source, evt);
	}

	private watchContainer(containerEl: HTMLElement): void {
		if (this.containerObservers.has(containerEl)) {
			return;
		}
		const observer = new MutationObserver((records) => {
			if (this.gesture) {
				return;
			}
			if (!records.some((record) => this.isRelevantMutation(record))) {
				return;
			}
			this.scheduleAttach();
		});
		observer.observe(containerEl, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['class', 'hidden'],
		});
		this.containerObservers.set(containerEl, observer);
	}

	private isRelevantMutation(record: MutationRecord): boolean {
		if (record.type === 'attributes') {
			const target = record.target;
			if (
				target instanceof HTMLElement &&
				(target.classList.contains(INSERT_INDICATOR_CLASS) ||
					target.classList.contains(HINT_CLASS) ||
					target.classList.contains(DRAG_OVERLAY_CLASS) ||
					target.classList.contains(DRAGGING_CLASS))
			) {
				return false;
			}
			return true;
		}
		if (record.type !== 'childList') {
			return false;
		}
		const nodes: Node[] = [
			...Array.from(record.addedNodes),
			...Array.from(record.removedNodes),
		];
		for (const node of nodes) {
			if (!(node instanceof HTMLElement)) {
				continue;
			}
			if (
				node.classList.contains(DRAGGING_CLASS) ||
				node.classList.contains(INSERT_INDICATOR_CLASS) ||
				node.classList.contains(HINT_CLASS)
			) {
				continue;
			}
			return true;
		}
		return false;
	}

	private syncReorderableItems(ctx: ContainerContext): void {
		const eligible = isSortEligibleForReorder(
			ctx.config,
			this.getSettings(),
		);
		const kind = viewKindFromBasesView(ctx.basesView);
		const selector = itemSelectorForKind(kind);

		removeLegacyDragHandles(ctx.containerEl);

		ctx.containerEl
			.querySelectorAll<HTMLElement>('.frontmatter-ordering-item')
			.forEach((itemEl) => {
				if (!itemEl.matches(selector)) {
					itemEl.classList.remove('frontmatter-ordering-item');
					clearCachedItemFilePath(itemEl);
					clearLinkDragSuppression(itemEl);
				}
			});

		ctx.containerEl.querySelectorAll<HTMLElement>(selector).forEach((itemEl) => {
			const resolved = resolveBasesItem(
				ctx.containerEl,
				ctx.basesView,
				itemEl,
			);
			if (!resolved || !eligible) {
				itemEl.classList.remove('frontmatter-ordering-item');
				clearCachedItemFilePath(itemEl);
				clearLinkDragSuppression(itemEl);
				return;
			}
			itemEl.classList.add('frontmatter-ordering-item');
			setCachedItemFilePath(itemEl, resolved.file.path);
			applyLinkDragSuppression(itemEl);
		});
	}

	private clearItemsInContainer(ctx: ContainerContext): void {
		const kind = viewKindFromBasesView(ctx.basesView);
		ctx.containerEl
			.querySelectorAll<HTMLElement>(itemSelectorForKind(kind))
			.forEach((itemEl) => {
				itemEl.classList.remove('frontmatter-ordering-item');
				clearLinkDragSuppression(itemEl);
			});
	}

	private updateHint(
		containerEl: HTMLElement,
		config: import('obsidian').BasesViewConfig,
	): void {
		const settings = this.getSettings();
		containerEl.querySelector(`.${HINT_CLASS}`)?.remove();
		if (!settings.showBasesSortHint) {
			return;
		}
		if (isSortEligibleForReorder(config, settings)) {
			return;
		}
		const hint = containerEl.createDiv({ cls: HINT_CLASS });
		hint.textContent = getBasesSortHintMessage(config, settings);
	}

	private shouldBlockNavigation(): boolean {
		return (
			this.gesture?.dragging === true ||
			Date.now() < this.suppressClickUntil
		);
	}

	private readonly blockNavigationEvent = (evt: Event): void => {
		if (!this.shouldBlockNavigation()) {
			return;
		}
		evt.preventDefault();
		evt.stopPropagation();
		evt.stopImmediatePropagation();
	};

	private attachClickSuppressBlockers(): void {
		if (this.clickSuppressBlockersActive) {
			return;
		}
		this.clickSuppressBlockersActive = true;
		const opts: AddEventListenerOptions = { capture: true };
		document.addEventListener('click', this.blockNavigationEvent, opts);
		document.addEventListener('auxclick', this.blockNavigationEvent, opts);
	}

	private detachClickSuppressBlockers(): void {
		if (!this.clickSuppressBlockersActive) {
			return;
		}
		this.clickSuppressBlockersActive = false;
		const opts: EventListenerOptions = { capture: true };
		document.removeEventListener('click', this.blockNavigationEvent, opts);
		document.removeEventListener(
			'auxclick',
			this.blockNavigationEvent,
			opts,
		);
	}

	private extendClickSuppression(): void {
		this.suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
		this.attachClickSuppressBlockers();
		this.scheduleClickSuppressRelease();
	}

	private scheduleClickSuppressRelease(): void {
		if (this.clickSuppressReleaseTimer !== null) {
			window.clearTimeout(this.clickSuppressReleaseTimer);
		}
		const delay = Math.max(0, this.suppressClickUntil - Date.now());
		this.clickSuppressReleaseTimer = window.setTimeout(() => {
			this.clickSuppressReleaseTimer = null;
			if (Date.now() >= this.suppressClickUntil) {
				this.detachClickSuppressBlockers();
			} else {
				this.scheduleClickSuppressRelease();
			}
		}, delay);
	}

	private clearDomSelection(): void {
		window.getSelection()?.removeAllRanges();
	}

	private clearBasesTableRowSelection(containerEl: HTMLElement): void {
		containerEl
			.querySelectorAll<HTMLElement>(
				'.bases-tbody .bases-tr.is-selected, .bases-tbody .bases-td.is-selected, .bases-tbody .bases-td.is-active',
			)
			.forEach((el) => {
				el.classList.remove('is-selected', 'is-active');
			});
		containerEl
			.querySelectorAll<HTMLElement>('.bases-tbody .bases-tr.is-active')
			.forEach((row) => {
				row.classList.remove('is-active');
			});
		containerEl
			.querySelectorAll<HTMLElement>('.bases-table-container.is-selecting')
			.forEach((el) => {
				el.classList.remove('is-selecting');
			});
		containerEl
			.querySelectorAll<HTMLElement>(
				'.bases-table-selection, .bases-table-active-cell',
			)
			.forEach((el) => {
				el.style.setProperty('visibility', 'hidden');
				el.classList.remove('mod-selection');
			});
	}

	private restoreBasesTableSelectionChrome(containerEl: HTMLElement): void {
		containerEl
			.querySelectorAll<HTMLElement>(
				'.bases-table-selection, .bases-table-active-cell',
			)
			.forEach((el) => {
				el.style.removeProperty('visibility');
			});
	}

	private ensureDragOverlay(containerEl: HTMLElement): void {
		if (
			this.dragOverlayEl &&
			this.dragOverlayEl.parentElement === containerEl
		) {
			return;
		}
		this.removeDragOverlay();
		this.dragOverlayEl = containerEl.createDiv({ cls: DRAG_OVERLAY_CLASS });
	}

	private removeDragOverlay(): void {
		this.dragOverlayEl?.remove();
		this.dragOverlayEl = null;
	}

	private readonly blockSelectStart = (evt: Event): void => {
		evt.preventDefault();
	};

	private readonly onTableSelectionChange = (): void => {
		const gesture = this.gesture;
		if (!gesture?.dragging) {
			return;
		}
		this.clearDomSelection();
		this.clearBasesTableRowSelection(gesture.container.containerEl);
	};

	private readonly blockTableMouseDownWhileDragging = (
		evt: MouseEvent,
	): void => {
		if (!this.gesture?.dragging) {
			return;
		}
		evt.preventDefault();
		evt.stopPropagation();
		evt.stopImmediatePropagation();
	};

	private readonly blockTablePointerDownWhileDragging = (
		evt: PointerEvent,
	): void => {
		if (!this.gesture?.dragging) {
			return;
		}
		evt.preventDefault();
		evt.stopPropagation();
		evt.stopImmediatePropagation();
	};

	private readonly blockTablePointerMoveWhileDragging = (
		evt: PointerEvent,
	): void => {
		if (!this.gesture?.dragging) {
			return;
		}
		evt.preventDefault();
		evt.stopPropagation();
	};

	private attachTableDragGuards(containerEl: HTMLElement): void {
		if (this.tableDragGuardsActive) {
			return;
		}
		this.tableDragGuardsActive = true;
		this.clearBasesTableRowSelection(containerEl);
		document.addEventListener('selectionchange', this.onTableSelectionChange);
		document.addEventListener(
			'mousedown',
			this.blockTableMouseDownWhileDragging,
			true,
		);
		document.addEventListener(
			'pointerdown',
			this.blockTablePointerDownWhileDragging,
			true,
		);
		document.addEventListener(
			'pointermove',
			this.blockTablePointerMoveWhileDragging,
			true,
		);
	}

	private detachTableDragGuards(): void {
		if (!this.tableDragGuardsActive) {
			return;
		}
		this.tableDragGuardsActive = false;
		document.removeEventListener(
			'selectionchange',
			this.onTableSelectionChange,
		);
		document.removeEventListener(
			'mousedown',
			this.blockTableMouseDownWhileDragging,
			true,
		);
		document.removeEventListener(
			'pointerdown',
			this.blockTablePointerDownWhileDragging,
			true,
		);
		document.removeEventListener(
			'pointermove',
			this.blockTablePointerMoveWhileDragging,
			true,
		);
	}

	private deactivateReorderActiveContainer(): void {
		const el = this.reorderActiveContainer;
		if (!el) {
			return;
		}
		el.classList.remove(REORDER_ACTIVE_CLASS);
		el.removeEventListener('selectstart', this.blockSelectStart, {
			capture: true,
		});
		this.removeDragOverlay();
		this.reorderActiveContainer = null;
	}

	private setReorderActive(containerEl: HTMLElement, active: boolean): void {
		if (active) {
			if (
				this.reorderActiveContainer &&
				this.reorderActiveContainer !== containerEl
			) {
				this.deactivateReorderActiveContainer();
			}
			this.reorderActiveContainer = containerEl;
			containerEl.classList.add(REORDER_ACTIVE_CLASS);
			containerEl.addEventListener('selectstart', this.blockSelectStart, {
				capture: true,
			});
			this.ensureDragOverlay(containerEl);
			return;
		}
		if (this.reorderActiveContainer === containerEl) {
			this.deactivateReorderActiveContainer();
		}
	}

	private scheduleClickSwallowOnContainer(containerEl: HTMLElement): void {
		window.requestAnimationFrame(() => {
			if (Date.now() >= this.suppressClickUntil) {
				return;
			}
			const stop = (evt: Event) => {
				if (!this.shouldBlockNavigation()) {
					return;
				}
				evt.preventDefault();
				evt.stopPropagation();
				evt.stopImmediatePropagation();
			};
			containerEl.addEventListener('click', stop, {
				capture: true,
				once: true,
			});
		});
	}

	private beginGesture(
		ctx: ContainerContext,
		source: ResolvedBasesItem,
		evt: PointerEvent,
	): void {
		if (this.gesture) {
			return;
		}
		const isTouch = evt.pointerType === 'touch';
		this.gesture = {
			container: ctx,
			source,
			pointerId: evt.pointerId,
			startX: evt.clientX,
			startY: evt.clientY,
			startedAt: Date.now(),
			dragging: false,
			isTouch,
			pendingInsertIndex: null,
			pendingSlot: null,
		};

		const onMove = (e: PointerEvent) => this.onPointerMove(e);
		const onUp = (e: PointerEvent) => {
			void this.onPointerUp(e);
			document.removeEventListener('pointermove', onMove, true);
			document.removeEventListener('pointerup', onUp, true);
			document.removeEventListener('pointercancel', onUp, true);
		};
		document.addEventListener('pointermove', onMove, true);
		document.addEventListener('pointerup', onUp, true);
		document.addEventListener('pointercancel', onUp, true);
	}

	private onPointerMove(evt: PointerEvent): void {
		const gesture = this.gesture;
		if (!gesture || evt.pointerId !== gesture.pointerId) {
			return;
		}
		const dx = evt.clientX - gesture.startX;
		const dy = evt.clientY - gesture.startY;
		const dist = Math.hypot(dx, dy);
		const elapsed = Date.now() - gesture.startedAt;

		const canStart = gesture.isTouch
			? (elapsed >= LONG_PRESS_MS && dist >= MOVE_THRESHOLD_PX) ||
				dist >= MOVE_THRESHOLD_PX * 2.5
			: dist >= MOVE_THRESHOLD_PX;

		if (!gesture.dragging && canStart) {
			gesture.dragging = true;
			this.extendClickSuppression();
			this.setReorderActive(gesture.container.containerEl, true);
			this.clearDomSelection();
			if (viewKindFromBasesView(gesture.container.basesView) === 'table') {
				this.attachTableDragGuards(gesture.container.containerEl);
			}
			gesture.source.itemEl.classList.add(DRAGGING_CLASS);
			try {
				gesture.source.itemEl.setPointerCapture(evt.pointerId);
			} catch {
				/* ignore */
			}
			evt.preventDefault();
			evt.stopPropagation();
		}
		if (!gesture.dragging) {
			return;
		}
		evt.preventDefault();
		evt.stopPropagation();
		this.clearDomSelection();
		this.scheduleInsertIndicatorUpdate(gesture, evt.clientX, evt.clientY);
	}

	private scheduleInsertIndicatorUpdate(
		gesture: ActiveGesture,
		clientX: number,
		clientY: number,
	): void {
		this.pendingIndicatorCoords = { x: clientX, y: clientY };
		if (this.indicatorRaf !== 0) {
			return;
		}
		this.indicatorRaf = window.requestAnimationFrame(() => {
			this.indicatorRaf = 0;
			const coords = this.pendingIndicatorCoords;
			const active = this.gesture;
			if (!coords || !active?.dragging) {
				return;
			}
			this.updateInsertIndicator(active, coords.x, coords.y);
		});
	}

	private async onPointerUp(evt: PointerEvent): Promise<void> {
		const gesture = this.gesture;
		if (!gesture || evt.pointerId !== gesture.pointerId) {
			return;
		}

		try {
			gesture.source.itemEl.releasePointerCapture(evt.pointerId);
		} catch {
			/* ignore */
		}

		if (gesture.dragging) {
			evt.preventDefault();
			evt.stopPropagation();

			this.refreshGestureContext(gesture);
			const placement = resolveDropPlacement(
				gesture.container.containerEl,
				gesture.container.basesView,
				gesture.source,
				evt.clientX,
				evt.clientY,
				gesture.pendingSlot,
			);
			const toIndex =
				placement?.insertIndex ?? gesture.pendingInsertIndex;
			if (toIndex !== null && toIndex !== gesture.source.index) {
				await this.handleDrop(gesture, toIndex);
			}
		}

		const hadDrag = gesture.dragging;
		const containerEl = gesture.container.containerEl;
		this.endGesture();
		if (hadDrag) {
			this.extendClickSuppression();
			this.scheduleClickSwallowOnContainer(containerEl);
		} else {
			this.detachClickSuppressBlockers();
		}
	}

	private endGesture(): void {
		const gesture = this.gesture;
		if (gesture) {
			gesture.source.itemEl.classList.remove(DRAGGING_CLASS);
			if (viewKindFromBasesView(gesture.container.basesView) === 'table') {
				this.clearBasesTableRowSelection(gesture.container.containerEl);
				this.restoreBasesTableSelectionChrome(
					gesture.container.containerEl,
				);
			}
			this.setReorderActive(gesture.container.containerEl, false);
		} else {
			this.deactivateReorderActiveContainer();
		}
		this.clearDomSelection();
		this.pendingIndicatorCoords = null;
		if (this.indicatorRaf !== 0) {
			window.cancelAnimationFrame(this.indicatorRaf);
			this.indicatorRaf = 0;
		}
		this.hideInsertIndicator();
		this.detachTableDragGuards();
		this.gesture = null;
	}

	private ensureInsertIndicator(containerEl: HTMLElement): HTMLElement {
		if (
			this.insertIndicatorEl &&
			this.insertIndicatorEl.parentElement !== containerEl
		) {
			this.insertIndicatorEl.remove();
			this.insertIndicatorEl = null;
		}
		if (!this.insertIndicatorEl) {
			this.insertIndicatorEl = containerEl.createDiv({
				cls: INSERT_INDICATOR_CLASS,
			});
		}
		return this.insertIndicatorEl;
	}

	private hideInsertIndicator(): void {
		this.insertIndicatorEl?.remove();
		this.insertIndicatorEl = null;
	}

	private updateInsertIndicator(
		gesture: ActiveGesture,
		clientX: number,
		clientY: number,
	): void {
		this.refreshGestureContext(gesture);
		const containerEl = gesture.container.containerEl;
		const placement = resolveDropPlacement(
			containerEl,
			gesture.container.basesView,
			gesture.source,
			clientX,
			clientY,
			gesture.pendingSlot,
		);
		if (!placement) {
			this.hideInsertIndicator();
			gesture.pendingInsertIndex = null;
			gesture.pendingSlot = null;
			return;
		}
		gesture.pendingInsertIndex = placement.insertIndex;
		gesture.pendingSlot = placement.slot;
		const el = this.ensureInsertIndicator(containerEl);
		const cr = containerEl.getBoundingClientRect();
		const v = placement.indicatorViewport;
		el.style.setProperty(
			'left',
			`${v.left - cr.left + containerEl.scrollLeft}px`,
		);
		el.style.setProperty(
			'top',
			`${v.top - cr.top + containerEl.scrollTop}px`,
		);
		el.style.setProperty('width', `${v.width}px`);
		el.style.setProperty('height', `${v.height}px`);
	}

	private async handleDrop(
		gesture: ActiveGesture,
		toIndex: number,
	): Promise<void> {
		const source = gesture.source;
		const entries = markdownEntriesFromResult(
			gesture.container.basesView.data,
			source.groupIndex,
		);
		const files = filesFromEntries(entries);
		const settings = this.getSettings();
		const displayDirection = reorderSortDirectionFromConfig(
			gesture.container.config,
			settings,
		);
		if (!displayDirection) {
			return;
		}

		const { failed } = await assignOrderAfterMove(
			this.app,
			settings,
			files,
			source.index,
			toIndex,
			displayDirection,
		);

		if (failed.length > 0) {
			new Notice(
				`Frontmatter ordering: could not update order for ${failed.map((f) => f.basename).join(', ')}.`,
			);
			return;
		}
		new Notice('Frontmatter ordering: order updated.');
	}
}

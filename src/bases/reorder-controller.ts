import { Notice, type App, type BasesView, type WorkspaceLeaf } from 'obsidian';
import type { BasesViewConfig } from 'obsidian';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { preventUnhandled } from '@atlaskit/pragmatic-drag-and-drop/prevent-unhandled';
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
	findTableNameCellInRow,
	itemSelectorForKind,
	removeLegacyDragHandles,
	type ResolvedBasesItem,
	resolveBasesItem,
	resolveDropPlacement,
	shouldStartTableReorderPointer,
	viewKindFromBasesView,
} from './dom-targets';
import {
	canStartTouchReorderDrag,
	useTouchPointerReorderPath,
} from './touch-reorder';
import {
	isBasesReorderDragData,
	registerBasesReorderItem,
} from './pragmatic-dnd';
import {
	mountReorderToggle,
	REORDER_TOGGLE_CLASS,
	type ReorderToggleHandle,
	setReorderArmedSurface,
} from './reorder-toggle';
import {
	clearCachedItemFilePath,
	setCachedItemFilePath,
} from './view-internals';

const DEBOUNCE_MS = 160;
const HINT_CLASS = 'frontmatter-ordering-bases-hint';
const DRAGGING_CLASS = 'frontmatter-ordering-dragging';
const INSERT_INDICATOR_CLASS = 'frontmatter-ordering-insert-indicator';
const REORDER_ACTIVE_CLASS = 'frontmatter-ordering-reorder-active';
const DRAG_OVERLAY_CLASS = 'frontmatter-ordering-drag-overlay';
const CLICK_SUPPRESS_MS = 650;

interface ContainerContext {
	containerEl: HTMLElement;
	basesView: BasesView;
	config: BasesViewConfig;
}

interface ActiveDrag {
	container: ContainerContext;
	source: ResolvedBasesItem;
	pendingInsertIndex: number | null;
	pendingSlot: number | null;
}

interface PendingTouchGesture {
	container: ContainerContext;
	source: ResolvedBasesItem;
	pointerId: number;
	startX: number;
	startY: number;
	startedAt: number;
	dragging: boolean;
}

export class BasesReorderController {
	private readonly containerObservers = new WeakMap<
		HTMLElement,
		MutationObserver
	>();
	private readonly boundContainers = new WeakSet<HTMLElement>();
	private readonly boundLeafRoots = new WeakSet<HTMLElement>();
	private readonly lastSyncedViewKey = new WeakMap<HTMLElement, string>();
	private readonly registrationBags = new WeakMap<HTMLElement, (() => void)[]>();
	private readonly containerMonitors = new WeakMap<HTMLElement, () => void>();
	private readonly reorderToggles = new Map<HTMLElement, ReorderToggleHandle>();
	private debounceTimer: number | null = null;
	private activeDrag: ActiveDrag | null = null;
	private touchGesture: PendingTouchGesture | null = null;
	private insertIndicatorEl: HTMLElement | null = null;
	private suppressClickUntil = 0;
	private clickSuppressBlockersActive = false;
	private clickSuppressReleaseTimer: number | null = null;
	private reorderActiveContainer: HTMLElement | null = null;
	private dragOverlayEl: HTMLElement | null = null;
	private indicatorRaf = 0;
	private pendingIndicatorCoords: { x: number; y: number } | null = null;
	private tableDragGuardsActive = false;
	private touchGrabMenuBlocker: ((evt: Event) => void) | null = null;
	private touchGrabBlockItemEl: HTMLElement | null = null;
	private touchGrabBlockContainerEl: HTMLElement | null = null;

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
		this.endTouchGesture();
		this.endActiveDrag();
		for (const handle of this.reorderToggles.values()) {
			handle.dispose();
		}
		this.reorderToggles.clear();
		for (const leaf of this.app.workspace.getLeavesOfType('bases')) {
			const ctx = getBasesContextFromLeaf(leaf);
			if (ctx) {
				this.containerObservers.get(ctx.containerEl)?.disconnect();
				setReorderArmedSurface(ctx.containerEl, false);
				this.disposeContainerDnd(ctx.containerEl);
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
			this.ensureReorderToggle(leaf, ctx.containerEl);
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

	private registrationBag(containerEl: HTMLElement): (() => void)[] {
		let bag = this.registrationBags.get(containerEl);
		if (!bag) {
			bag = [];
			this.registrationBags.set(containerEl, bag);
		}
		return bag;
	}

	private disposeItemRegistrations(containerEl: HTMLElement): void {
		const bag = this.registrationBags.get(containerEl);
		if (!bag) {
			return;
		}
		for (const dispose of bag) {
			dispose();
		}
		bag.length = 0;
	}

	private disposeContainerDnd(containerEl: HTMLElement): void {
		this.disposeItemRegistrations(containerEl);
		this.containerMonitors.get(containerEl)?.();
		this.containerMonitors.delete(containerEl);
	}

	private ensureReorderToggle(
		leaf: WorkspaceLeaf,
		containerEl: HTMLElement,
	): void {
		let handle = this.reorderToggles.get(containerEl);
		if (!handle) {
			handle = mountReorderToggle(
				leaf.view.containerEl,
				containerEl,
				this.getSettings().defaultBasesReorderMode,
				() => {
					const ctx = this.contextForContainer(containerEl);
					if (ctx) {
						this.syncReorderableItems(ctx);
					}
				},
			);
			this.reorderToggles.set(containerEl, handle);
		} else if (!handle.isMounted()) {
			handle.remount();
		}
	}

	private isReorderArmed(containerEl: HTMLElement): boolean {
		return this.reorderToggles.get(containerEl)?.isArmed() ?? false;
	}

	private updateReorderSurface(
		containerEl: HTMLElement,
		armed: boolean,
		eligible: boolean,
	): void {
		setReorderArmedSurface(containerEl, armed && eligible);
	}

	private bindContainer(containerEl: HTMLElement): void {
		if (this.boundContainers.has(containerEl)) {
			return;
		}
		this.boundContainers.add(containerEl);

		containerEl.addEventListener(
			'dragstart',
			(evt) => this.onContainerDragStart(containerEl, evt),
			{ capture: true },
		);

		if (useTouchPointerReorderPath()) {
			containerEl.addEventListener(
				'pointerdown',
				(evt) => this.onContainerPointerDown(containerEl, evt),
				{ capture: true },
			);
		}

		const monitorCleanup = monitorForElements({
			canMonitor: ({ source }) => isBasesReorderDragData(source.data),
			onDragStart: ({ source }) => {
				const ctx = this.contextForContainer(containerEl);
				if (!ctx) {
					return;
				}
				this.ensureViewSynced(ctx);
				const resolved = resolveBasesItem(
					ctx.containerEl,
					ctx.basesView,
					source.element,
				);
				if (!resolved) {
					return;
				}
				this.activeDrag = {
					container: ctx,
					source: resolved,
					pendingInsertIndex: null,
					pendingSlot: null,
				};
				this.extendClickSuppression();
				preventUnhandled.start();
				this.setReorderActive(ctx.containerEl, true);
				resolved.itemEl.classList.add(DRAGGING_CLASS);
				this.clearDomSelection();
				if (viewKindFromBasesView(ctx.basesView) === 'table') {
					this.attachTableDragGuards(ctx.containerEl);
				}
			},
			onDrag: ({ location }) => {
				if (!this.activeDrag) {
					return;
				}
				const { clientX, clientY } = location.current.input;
				this.scheduleInsertIndicatorUpdate(
					this.activeDrag,
					clientX,
					clientY,
				);
			},
			onDrop: ({ location }) => {
				void this.commitActiveDrag(location.current.input.clientX, location.current.input.clientY);
			},
		});
		this.containerMonitors.set(containerEl, monitorCleanup);
	}

	private refreshTouchGestureContext(gesture: PendingTouchGesture): void {
		const fresh = this.contextForContainer(gesture.container.containerEl);
		if (fresh) {
			gesture.container = fresh;
		}
	}

	private onContainerPointerDown(
		containerEl: HTMLElement,
		evt: PointerEvent,
	): void {
		if (evt.pointerType !== 'touch' && evt.pointerType !== 'pen') {
			return;
		}
		if (this.touchGesture || this.activeDrag) {
			return;
		}
		const ctx = this.contextForContainer(containerEl);
		if (!ctx) {
			return;
		}
		this.ensureViewSynced(ctx);
		if (!this.isReorderArmed(containerEl)) {
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
		if (!itemEl.classList.contains('frontmatter-ordering-item')) {
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
		this.beginTouchGesture(ctx, source, evt);
	}

	private readonly blockTouchGrabMenu = (evt: Event): void => {
		evt.preventDefault();
		evt.stopPropagation();
		evt.stopImmediatePropagation();
	};

	private attachTouchGrabMenuBlock(
		itemEl: HTMLElement,
		containerEl: HTMLElement,
	): void {
		this.detachTouchGrabMenuBlock();
		this.touchGrabMenuBlocker = this.blockTouchGrabMenu;
		this.touchGrabBlockItemEl = itemEl;
		this.touchGrabBlockContainerEl = containerEl;
		const opts: AddEventListenerOptions = { capture: true };
		itemEl.addEventListener('contextmenu', this.blockTouchGrabMenu, opts);
		containerEl.addEventListener('contextmenu', this.blockTouchGrabMenu, opts);
	}

	private detachTouchGrabMenuBlock(): void {
		if (!this.touchGrabMenuBlocker) {
			return;
		}
		const opts: EventListenerOptions = { capture: true };
		this.touchGrabBlockItemEl?.removeEventListener(
			'contextmenu',
			this.touchGrabMenuBlocker,
			opts,
		);
		this.touchGrabBlockContainerEl?.removeEventListener(
			'contextmenu',
			this.touchGrabMenuBlocker,
			opts,
		);
		this.touchGrabMenuBlocker = null;
		this.touchGrabBlockItemEl = null;
		this.touchGrabBlockContainerEl = null;
	}

	private beginTouchGesture(
		ctx: ContainerContext,
		source: ResolvedBasesItem,
		evt: PointerEvent,
	): void {
		if (this.touchGesture) {
			return;
		}
		evt.preventDefault();
		evt.stopPropagation();
		this.attachTouchGrabMenuBlock(source.itemEl, ctx.containerEl);
		this.touchGesture = {
			container: ctx,
			source,
			pointerId: evt.pointerId,
			startX: evt.clientX,
			startY: evt.clientY,
			startedAt: Date.now(),
			dragging: false,
		};

		const onMove = (e: PointerEvent) => this.onTouchPointerMove(e);
		const onUp = (e: PointerEvent) => {
			void this.onTouchPointerUp(e);
			document.removeEventListener('pointermove', onMove, true);
			document.removeEventListener('pointerup', onUp, true);
			document.removeEventListener('pointercancel', onUp, true);
		};
		document.addEventListener('pointermove', onMove, true);
		document.addEventListener('pointerup', onUp, true);
		document.addEventListener('pointercancel', onUp, true);
	}

	private onTouchPointerMove(evt: PointerEvent): void {
		const gesture = this.touchGesture;
		if (!gesture || evt.pointerId !== gesture.pointerId) {
			return;
		}
		const dx = evt.clientX - gesture.startX;
		const dy = evt.clientY - gesture.startY;
		const dist = Math.hypot(dx, dy);

		if (!gesture.dragging && canStartTouchReorderDrag(dist)) {
			gesture.dragging = true;
			this.activeDrag = {
				container: gesture.container,
				source: gesture.source,
				pendingInsertIndex: null,
				pendingSlot: null,
			};
			this.extendClickSuppression();
			this.setReorderActive(gesture.container.containerEl, true);
			this.clearDomSelection();
			if (
				viewKindFromBasesView(gesture.container.basesView) === 'table'
			) {
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
		if (!gesture.dragging || !this.activeDrag) {
			return;
		}
		evt.preventDefault();
		evt.stopPropagation();
		this.clearDomSelection();
		this.scheduleInsertIndicatorUpdate(
			this.activeDrag,
			evt.clientX,
			evt.clientY,
		);
	}

	private async onTouchPointerUp(evt: PointerEvent): Promise<void> {
		const gesture = this.touchGesture;
		if (!gesture || evt.pointerId !== gesture.pointerId) {
			return;
		}

		try {
			gesture.source.itemEl.releasePointerCapture(evt.pointerId);
		} catch {
			/* ignore */
		}

		const hadDrag = gesture.dragging;

		if (hadDrag && this.activeDrag) {
			evt.preventDefault();
			evt.stopPropagation();
			this.refreshTouchGestureContext(gesture);
			await this.commitActiveDrag(evt.clientX, evt.clientY);
		} else {
			evt.preventDefault();
			evt.stopPropagation();
			this.extendClickSuppression();
			this.scheduleClickSwallowOnContainer(gesture.container.containerEl);
		}

		this.detachTouchGrabMenuBlock();
		this.touchGesture = null;
	}

	private endTouchGesture(): void {
		if (!this.touchGesture) {
			this.detachTouchGrabMenuBlock();
			return;
		}
		const gesture = this.touchGesture;
		try {
			gesture.source.itemEl.releasePointerCapture(gesture.pointerId);
		} catch {
			/* ignore */
		}
		this.detachTouchGrabMenuBlock();
		this.touchGesture = null;
		if (gesture.dragging) {
			this.endActiveDrag();
		}
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
		const target = evt.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}
		if (target.closest('a.internal-link') && !target.closest('.frontmatter-ordering-item')) {
			evt.preventDefault();
			evt.stopPropagation();
		}
	}

	private async commitActiveDrag(
		clientX: number,
		clientY: number,
	): Promise<void> {
		const drag = this.activeDrag;
		if (!drag) {
			return;
		}
		const containerEl = drag.container.containerEl;
		const placement = resolveDropPlacement(
			containerEl,
			drag.container.basesView,
			drag.source,
			clientX,
			clientY,
			drag.pendingSlot,
		);
		const toIndex = placement?.insertIndex ?? drag.pendingInsertIndex;
		if (toIndex !== null && toIndex !== drag.source.index) {
			await this.handleDrop(drag, toIndex);
		}
		this.endActiveDrag();
		this.extendClickSuppression();
		this.scheduleClickSwallowOnContainer(containerEl);
	}

	private endActiveDrag(): void {
		const drag = this.activeDrag;
		if (drag) {
			drag.source.itemEl.classList.remove(DRAGGING_CLASS);
			if (viewKindFromBasesView(drag.container.basesView) === 'table') {
				this.clearBasesTableRowSelection(drag.container.containerEl);
				this.restoreBasesTableSelectionChrome(
					drag.container.containerEl,
				);
			}
			this.setReorderActive(drag.container.containerEl, false);
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
		preventUnhandled.stop();
		this.activeDrag = null;
	}

	private watchContainer(containerEl: HTMLElement): void {
		if (this.containerObservers.has(containerEl)) {
			return;
		}
		const observer = new MutationObserver((records) => {
			if (this.activeDrag || this.touchGesture) {
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
					target.classList.contains(DRAGGING_CLASS) ||
					target.classList.contains(REORDER_TOGGLE_CLASS) ||
					target.closest('.frontmatter-ordering-reorder-toggle-wrap'))
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
		if (this.activeDrag || this.touchGesture) {
			return;
		}
		const eligible = isSortEligibleForReorder(
			ctx.config,
			this.getSettings(),
		);
		const armed = this.isReorderArmed(ctx.containerEl);
		this.updateReorderSurface(ctx.containerEl, armed, eligible);
		const kind = viewKindFromBasesView(ctx.basesView);
		const selector = itemSelectorForKind(kind);

		removeLegacyDragHandles(ctx.containerEl);
		this.disposeItemRegistrations(ctx.containerEl);

		ctx.containerEl
			.querySelectorAll<HTMLElement>('.frontmatter-ordering-item')
			.forEach((itemEl) => {
				if (!itemEl.matches(selector)) {
					itemEl.classList.remove('frontmatter-ordering-item');
					clearCachedItemFilePath(itemEl);
					clearLinkDragSuppression(itemEl);
				}
			});

		const bag = this.registrationBag(ctx.containerEl);
		const touchPath = useTouchPointerReorderPath();

		ctx.containerEl.querySelectorAll<HTMLElement>(selector).forEach((itemEl) => {
			const resolved = resolveBasesItem(
				ctx.containerEl,
				ctx.basesView,
				itemEl,
			);
			if (!resolved || !eligible || !armed) {
				itemEl.classList.remove('frontmatter-ordering-item');
				clearCachedItemFilePath(itemEl);
				clearLinkDragSuppression(itemEl);
				return;
			}
			itemEl.classList.add('frontmatter-ordering-item');
			setCachedItemFilePath(itemEl, resolved.file.path);

			if (touchPath) {
				applyLinkDragSuppression(itemEl);
				if (kind === 'table' && !findTableNameCellInRow(itemEl)) {
					itemEl.classList.remove('frontmatter-ordering-item');
					clearCachedItemFilePath(itemEl);
					clearLinkDragSuppression(itemEl);
				}
				return;
			}

			clearLinkDragSuppression(itemEl);

			const dragHandle =
				kind === 'table' ? findTableNameCellInRow(itemEl) : undefined;
			if (kind === 'table' && !dragHandle) {
				return;
			}

			const dispose = registerBasesReorderItem({
				element: itemEl,
				dragHandle: dragHandle ?? undefined,
				path: resolved.file.path,
				index: resolved.index,
				groupIndex: resolved.groupIndex,
			});
			bag.push(dispose);
		});
	}

	private clearItemsInContainer(ctx: {
		containerEl: HTMLElement;
		basesView: BasesView;
	}): void {
		this.disposeItemRegistrations(ctx.containerEl);
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
		config: BasesViewConfig,
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
			this.activeDrag !== null ||
			this.touchGesture?.dragging === true ||
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
		document.addEventListener('contextmenu', this.blockNavigationEvent, opts);
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
		document.removeEventListener(
			'contextmenu',
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
		if (!this.activeDrag) {
			return;
		}
		this.clearDomSelection();
		this.clearBasesTableRowSelection(this.activeDrag.container.containerEl);
	};

	private readonly blockTableMouseDownWhileDragging = (
		evt: MouseEvent,
	): void => {
		if (!this.activeDrag) {
			return;
		}
		evt.preventDefault();
		evt.stopPropagation();
		evt.stopImmediatePropagation();
	};

	private readonly blockTablePointerDownWhileDragging = (
		evt: PointerEvent,
	): void => {
		if (!this.activeDrag) {
			return;
		}
		evt.preventDefault();
		evt.stopPropagation();
		evt.stopImmediatePropagation();
	};

	private readonly blockTablePointerMoveWhileDragging = (
		evt: PointerEvent,
	): void => {
		if (!this.activeDrag) {
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

	private scheduleInsertIndicatorUpdate(
		drag: ActiveDrag,
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
			const active = this.activeDrag;
			if (!coords || !active) {
				return;
			}
			this.updateInsertIndicator(active, coords.x, coords.y);
		});
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
		drag: ActiveDrag,
		clientX: number,
		clientY: number,
	): void {
		const containerEl = drag.container.containerEl;
		const placement = resolveDropPlacement(
			containerEl,
			drag.container.basesView,
			drag.source,
			clientX,
			clientY,
			drag.pendingSlot,
		);
		if (!placement) {
			this.hideInsertIndicator();
			drag.pendingInsertIndex = null;
			drag.pendingSlot = null;
			return;
		}
		drag.pendingInsertIndex = placement.insertIndex;
		drag.pendingSlot = placement.slot;
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
		drag: ActiveDrag,
		toIndex: number,
	): Promise<void> {
		const source = drag.source;
		const entries = markdownEntriesFromResult(
			drag.container.basesView.data,
			source.groupIndex,
		);
		const files = filesFromEntries(entries);
		const settings = this.getSettings();
		const displayDirection = reorderSortDirectionFromConfig(
			drag.container.config,
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

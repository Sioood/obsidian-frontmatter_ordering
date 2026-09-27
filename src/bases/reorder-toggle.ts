import { setIcon } from 'obsidian';

export const REORDER_ARMED_SURFACE_CLASS = 'frontmatter-ordering-reorder-armed';
export const REORDER_TOGGLE_CLASS = 'frontmatter-ordering-reorder-toggle';
const TOGGLE_WRAP_CLASS = 'frontmatter-ordering-reorder-toggle-wrap';

const SORT_LABELS = new Set(['sort', 'trier']);

export interface ReorderToggleHandle {
	isArmed(): boolean;
	isMounted(): boolean;
	remount(): void;
	dispose(): void;
}

function isPluginToggleElement(el: Element): boolean {
	return el.closest(`.${TOGGLE_WRAP_CLASS}`) !== null;
}

function normalizeLabel(text: string | null | undefined): string {
	return text?.trim().toLowerCase() ?? '';
}

function isSortControl(el: HTMLElement): boolean {
	if (isPluginToggleElement(el)) {
		return false;
	}
	if (
		el.classList.contains('bases-sort') ||
		el.classList.contains('bases-toolbar-sort-menu')
	) {
		return true;
	}
	const aria = normalizeLabel(el.getAttribute('aria-label'));
	if (aria.includes('sort') || aria.includes('trier')) {
		return true;
	}
	const tooltip = normalizeLabel(
		el.dataset.tooltip ?? el.getAttribute('data-tooltip'),
	);
	if (tooltip.includes('sort') || tooltip.includes('trier')) {
		return true;
	}
	const directText = normalizeLabel(el.textContent);
	if (SORT_LABELS.has(directText)) {
		return true;
	}
	for (const labelEl of Array.from(
		el.querySelectorAll<HTMLElement>('.text-icon-button-label, .button-label'),
	)) {
		if (SORT_LABELS.has(normalizeLabel(labelEl.textContent))) {
			return true;
		}
	}
	return false;
}

const SORT_MENU_SELECTOR =
	'.bases-toolbar-sort-menu, .bases-toolbar-item.bases-toolbar-sort-menu';

function collectSearchRoots(
	viewRoot: HTMLElement,
	containerEl: HTMLElement,
): HTMLElement[] {
	const roots: HTMLElement[] = [];
	const seen = new Set<HTMLElement>();
	const add = (el: HTMLElement | null | undefined) => {
		if (!el || seen.has(el)) {
			return;
		}
		seen.add(el);
		roots.push(el);
	};
	add(viewRoot);
	add(containerEl);
	add(containerEl.parentElement);
	add(viewRoot.querySelector<HTMLElement>('.bases-toolbar'));
	add(
		containerEl.closest<HTMLElement>('.view-content')?.parentElement ??
			null,
	);
	return roots;
}

/** Bases sort control (e.g. **Trier** / **Sort**) in the right toolbar cluster. */
export function findSortControl(
	viewRoot: HTMLElement,
	containerEl: HTMLElement,
): HTMLElement | null {
	for (const root of collectSearchRoots(viewRoot, containerEl)) {
		const sortMenu = root.querySelector<HTMLElement>(SORT_MENU_SELECTOR);
		if (sortMenu && !isPluginToggleElement(sortMenu)) {
			return sortMenu.classList.contains('bases-toolbar-item')
				? sortMenu
				: (sortMenu.closest<HTMLElement>('.bases-toolbar-item') ?? sortMenu);
		}
	}

	for (const root of collectSearchRoots(viewRoot, containerEl)) {
		for (const button of Array.from(
			root.querySelectorAll<HTMLElement>('button'),
		)) {
		if (isPluginToggleElement(button)) {
			continue;
		}
			if (isSortControl(button)) {
				return button;
			}
		}
	}

	for (const root of collectSearchRoots(viewRoot, containerEl)) {
		for (const labelEl of Array.from(
			root.querySelectorAll<HTMLElement>(
				'.text-icon-button-label, .button-label',
			),
		)) {
		if (!SORT_LABELS.has(normalizeLabel(labelEl.textContent))) {
			continue;
		}
		const button = labelEl.closest('button');
		if (button && !isPluginToggleElement(button)) {
			return button;
		}
		const clickable = labelEl.closest('.clickable-icon, [role="button"]');
			if (
				clickable instanceof HTMLElement &&
				!isPluginToggleElement(clickable)
			) {
				return clickable;
			}
		}
	}

	for (const root of collectSearchRoots(viewRoot, containerEl)) {
		const attrMatch =
			root.querySelector<HTMLElement>('[aria-label*="trier" i]') ??
			root.querySelector<HTMLElement>('[aria-label*="sort" i]') ??
			root.querySelector<HTMLElement>('[data-tooltip*="trier" i]') ??
			root.querySelector<HTMLElement>('[data-tooltip*="sort" i]') ??
			root.querySelector<HTMLElement>('.bases-sort');
		if (attrMatch && !isPluginToggleElement(attrMatch)) {
			return attrMatch.closest('button') ?? attrMatch;
		}
	}
	return null;
}

function updateToggleUi(button: HTMLButtonElement, armed: boolean): void {
	button.setAttribute('aria-pressed', armed ? 'true' : 'false');
	button.setAttribute(
		'aria-label',
		armed ? 'Reorder notes on' : 'Reorder notes off',
	);
	button.toggleAttribute('data-frontmatter-ordering-armed', armed);
	button.classList.toggle('is-active', armed);
	button.dataset.tooltip = armed
		? 'Drag to reorder (on). Turn off to swipe sidebars on mobile.'
		: 'Drag to reorder (off). Turn on to reorder notes.';
}

export function setReorderArmedSurface(
	containerEl: HTMLElement,
	armed: boolean,
): void {
	const surface =
		containerEl.classList.contains('bases-view')
			? containerEl
			: containerEl.closest<HTMLElement>('.bases-view');
	if (surface) {
		surface.classList.toggle(REORDER_ARMED_SURFACE_CLASS, armed);
	}
}

export function mountReorderToggle(
	viewRoot: HTMLElement,
	containerEl: HTMLElement,
	initialArmed: boolean,
	onArmedChange: (armed: boolean) => void,
): ReorderToggleHandle {
	let armed = initialArmed;
	let wrap: HTMLElement | null = null;
	let button: HTMLButtonElement | null = null;

	const onClick = (evt: MouseEvent) => {
		evt.preventDefault();
		evt.stopPropagation();
		armed = !armed;
		if (button) {
			updateToggleUi(button, armed);
		}
		onArmedChange(armed);
	};

	const mount = (): void => {
		if (button?.isConnected) {
			return;
		}
		wrap?.remove();
		const sortAnchor = findSortControl(viewRoot, containerEl);
		if (!sortAnchor) {
			wrap = null;
			button = null;
			return;
		}

		wrap = document.createElement('div');
		wrap.className = `${TOGGLE_WRAP_CLASS} bases-toolbar-item`;
		button = document.createElement('button');
		button.type = 'button';
		button.className = `clickable-icon ${REORDER_TOGGLE_CLASS}`;
		setIcon(button, 'hand-grab');
		updateToggleUi(button, armed);
		button.addEventListener('click', onClick);
		wrap.appendChild(button);
		sortAnchor.insertAdjacentElement('beforebegin', wrap);
	};

	mount();

	return {
		isArmed: () => armed,
		isMounted: () => button?.isConnected === true,
		remount: () => mount(),
		dispose: () => {
			button?.removeEventListener('click', onClick);
			wrap?.remove();
			wrap = null;
			button = null;
		},
	};
}

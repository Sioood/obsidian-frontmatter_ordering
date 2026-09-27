/**
 * Touch reorder uses pointer tracking instead of HTML5 drag (PdD), which is
 * unreliable in Obsidian’s mobile WebView.
 *
 * Grab mode (reorder toggle on): block item menu and edge sidebars on the Bases
 * surface; start drag on a small movement threshold (no long-press delay).
 */
export const TOUCH_MOVE_THRESHOLD_PX = 4;

/** True when the primary input is touch (phones, most tablets). */
export function useTouchPointerReorderPath(): boolean {
	if (typeof window === 'undefined') {
		return false;
	}
	if (window.matchMedia('(pointer: coarse)').matches) {
		return true;
	}
	return (
		navigator.maxTouchPoints > 0 &&
		window.matchMedia('(hover: none)').matches
	);
}

export function canStartTouchReorderDrag(distancePx: number): boolean {
	return distancePx >= TOUCH_MOVE_THRESHOLD_PX;
}

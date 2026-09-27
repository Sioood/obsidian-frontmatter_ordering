/**
 * Touch reorder uses pointer tracking instead of HTML5 drag (PdD), which is
 * unreliable in Obsidian’s mobile WebView: items may only dim and the release
 * opens the item menu. Gesture model:
 * - Hold without moving past threshold → no plugin capture; Obsidian menu OK.
 * - Hold then move (or long-press + small move) → reorder; suppress menu on drop.
 */
export const TOUCH_MOVE_THRESHOLD_PX = 4;
export const TOUCH_LONG_PRESS_MS = 180;

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

export function canStartTouchReorderDrag(
	elapsedMs: number,
	distancePx: number,
): boolean {
	return (
		(elapsedMs >= TOUCH_LONG_PRESS_MS &&
			distancePx >= TOUCH_MOVE_THRESHOLD_PX) ||
		distancePx >= TOUCH_MOVE_THRESHOLD_PX * 2.5
	);
}

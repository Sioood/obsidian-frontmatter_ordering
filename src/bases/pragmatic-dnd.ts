import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
	draggable,
	dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { disableNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/disable-native-drag-preview';

export const BASES_REORDER_DRAG_TYPE = 'frontmatter-ordering/bases-reorder';

export interface BasesReorderDragData {
	type: typeof BASES_REORDER_DRAG_TYPE;
	path: string;
	index: number;
	groupIndex: number;
}

export function isBasesReorderDragData(
	data: Record<string, unknown>,
): boolean {
	return (
		data.type === BASES_REORDER_DRAG_TYPE &&
		typeof data.path === 'string' &&
		typeof data.index === 'number' &&
		typeof data.groupIndex === 'number'
	);
}

function dragPayload(
	options: {
		path: string;
		index: number;
		groupIndex: number;
	},
): Record<string, unknown> {
	return {
		type: BASES_REORDER_DRAG_TYPE,
		path: options.path,
		index: options.index,
		groupIndex: options.groupIndex,
	};
}

export function registerBasesReorderItem(options: {
	element: HTMLElement;
	dragHandle?: HTMLElement;
	path: string;
	index: number;
	groupIndex: number;
}): () => void {
	const payload = () => dragPayload(options);

	return combine(
		draggable({
			element: options.element,
			dragHandle: options.dragHandle,
			getInitialData: () => payload(),
			onGenerateDragPreview: ({ nativeSetDragImage }) => {
				disableNativeDragPreview({ nativeSetDragImage });
			},
		}),
		dropTargetForElements({
			element: options.element,
			getData: () => payload(),
		}),
	);
}

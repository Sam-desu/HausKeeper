import type { Node } from './Node.ts';
import type { Vector2d } from './types.ts';
type DragElement = {
    node: Node;
    startPointerPos: Vector2d;
    offset: Vector2d;
    pointerId?: number;
    startEvent?: any;
    dragStatus: 'ready' | 'dragging' | 'stopped';
};
export declare const DD: {
    readonly isDragging: boolean;
    justDragged: boolean;
    readonly node: Node<import("./Node.ts").NodeConfig> | undefined;
    _dragElements: Map<number, DragElement>;
    _listenToWindow(win: Window): void;
    _drag(evt: any, win?: Window): void;
    _endDragBefore(evt?: any, win?: Window): void;
    _endDragAfter(evt: any): void;
};
export {};

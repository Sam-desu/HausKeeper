import { Konva } from "./Global.js";
import { Util } from "./Util.js";
export const DD = {
    get isDragging() {
        let flag = false;
        DD._dragElements.forEach((elem) => {
            if (elem.dragStatus === 'dragging') {
                flag = true;
            }
        });
        return flag;
    },
    justDragged: false,
    get node() {
        let node;
        DD._dragElements.forEach((elem) => {
            node = elem.node;
        });
        return node;
    },
    _dragElements: new Map(),
    _listenToWindow(win) {
        const endDragBefore = (evt) => DD._endDragBefore(evt, win);
        const drag = (evt) => DD._drag(evt, win);
        win.addEventListener('mouseup', endDragBefore, true);
        win.addEventListener('touchend', endDragBefore, true);
        win.addEventListener('touchcancel', endDragBefore, true);
        win.addEventListener('mousemove', drag);
        win.addEventListener('touchmove', drag);
        win.addEventListener('mouseup', DD._endDragAfter, false);
        win.addEventListener('touchend', DD._endDragAfter, false);
        win.addEventListener('touchcancel', DD._endDragAfter, false);
    },
    _drag(evt, win) {
        const nodesToFireEvents = [];
        DD._dragElements.forEach((elem, key) => {
            const { node } = elem;
            const stage = node.getStage();
            if (win && stage._getOwnerWindow() !== win) {
                return;
            }
            stage.setPointersPositions(evt);
            if (elem.pointerId === undefined) {
                elem.pointerId = Util._getFirstPointerId(evt);
            }
            const pos = stage._changedPointerPositions.find((pos) => pos.id === elem.pointerId);
            if (!pos) {
                return;
            }
            if (elem.dragStatus !== 'dragging') {
                const dragDistance = node.dragDistance();
                const distance = Math.max(Math.abs(pos.x - elem.startPointerPos.x), Math.abs(pos.y - elem.startPointerPos.y));
                if (distance < dragDistance) {
                    return;
                }
                node.startDrag({ evt });
                if (!node.isDragging()) {
                    return;
                }
            }
            node._setDragPosition(evt, elem);
            nodesToFireEvents.push(node);
        });
        nodesToFireEvents.forEach((node) => {
            if (!node.getStage()) {
                return;
            }
            node.fire('dragmove', {
                type: 'dragmove',
                target: node,
                evt: evt,
            }, true);
        });
    },
    _endDragBefore(evt, win) {
        const drawNodes = [];
        DD._dragElements.forEach((elem) => {
            const { node } = elem;
            const stage = node.getStage();
            if (evt && (!win || stage._getOwnerWindow() === win)) {
                stage.setPointersPositions(evt);
            }
            const pos = stage._changedPointerPositions.find((pos) => pos.id === elem.pointerId);
            if (!pos) {
                return;
            }
            if (elem.dragStatus === 'dragging' || elem.dragStatus === 'stopped') {
                DD.justDragged = true;
                Konva._mouseListenClick = false;
                Konva._touchListenClick = false;
                Konva._pointerListenClick = false;
                elem.dragStatus = 'stopped';
            }
            const drawNode = elem.node.getLayer() ||
                (elem.node instanceof Konva['Stage'] && elem.node);
            if (drawNode && drawNodes.indexOf(drawNode) === -1) {
                drawNodes.push(drawNode);
            }
        });
        drawNodes.forEach((drawNode) => {
            drawNode.draw();
        });
    },
    _endDragAfter(evt) {
        DD._dragElements.forEach((elem, key) => {
            if (elem.dragStatus === 'stopped') {
                elem.node.fire('dragend', {
                    type: 'dragend',
                    target: elem.node,
                    evt: evt,
                }, true);
            }
            if (elem.dragStatus !== 'dragging') {
                DD._dragElements.delete(key);
            }
        });
    },
};

import { Konva } from "./Global.js";
const Captures = new Map();
const SUPPORT_POINTER_EVENTS = Konva._global['PointerEvent'] !== undefined;
export function getCapturedShape(pointerId) {
    return Captures.get(pointerId);
}
export function createEvent(evt) {
    return {
        evt,
        pointerId: evt.pointerId,
    };
}
export function hasPointerCapture(pointerId, shape) {
    return Captures.get(pointerId) === shape;
}
export function setPointerCapture(pointerId, shape) {
    var _a;
    releaseCapture(pointerId);
    const stage = shape.getStage();
    if (!stage)
        return;
    Captures.set(pointerId, shape);
    if (SUPPORT_POINTER_EVENTS) {
        try {
            (_a = stage.content) === null || _a === void 0 ? void 0 : _a.setPointerCapture(pointerId);
        }
        catch (e) {
        }
        shape._fire('gotpointercapture', createEvent(new PointerEvent('gotpointercapture')));
    }
}
export function releaseCapture(pointerId, target) {
    var _a;
    const shape = Captures.get(pointerId);
    if (!shape)
        return;
    const stage = shape.getStage();
    Captures.delete(pointerId);
    if (SUPPORT_POINTER_EVENTS) {
        try {
            (_a = stage === null || stage === void 0 ? void 0 : stage.content) === null || _a === void 0 ? void 0 : _a.releasePointerCapture(pointerId);
        }
        catch (e) {
        }
        shape._fire('lostpointercapture', createEvent(new PointerEvent('lostpointercapture')));
    }
}

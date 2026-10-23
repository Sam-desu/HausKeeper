import { getCubicExtremaPoints, getQuadraticExtremaPoints, } from "../BezierFunctions.js";
import { Factory } from "../Factory.js";
import { _registerNode } from "../Global.js";
import { Shape } from "../Shape.js";
import { getNumberArrayValidator, getNumberValidator } from "../Validators.js";
function getControlPoints(x0, y0, x1, y1, x2, y2, t) {
    const d01 = Math.sqrt(Math.pow(x1 - x0, 2) + Math.pow(y1 - y0, 2)), d12 = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)), dSum = d01 + d12;
    if (dSum === 0) {
        return [x1, y1, x1, y1];
    }
    const fa = (t * d01) / dSum, fb = (t * d12) / dSum, p1x = x1 - fa * (x2 - x0), p1y = y1 - fa * (y2 - y0), p2x = x1 + fb * (x2 - x0), p2y = y1 + fb * (y2 - y0);
    return [p1x, p1y, p2x, p2y];
}
function expandPoints(p, tension) {
    const len = p.length, allPoints = [];
    for (let n = 2; n < len - 2; n += 2) {
        const cp = getControlPoints(p[n - 2], p[n - 1], p[n], p[n + 1], p[n + 2], p[n + 3], tension);
        if (isNaN(cp[0])) {
            continue;
        }
        allPoints.push(cp[0]);
        allPoints.push(cp[1]);
        allPoints.push(p[n]);
        allPoints.push(p[n + 1]);
        allPoints.push(cp[2]);
        allPoints.push(cp[3]);
    }
    return allPoints;
}
function getBezierExtremaPoints(points) {
    const extrema = [];
    for (let n = 0; n + 7 < points.length; n += 6) {
        extrema.push(points[n + 6], points[n + 7], ...getCubicExtremaPoints(points[n], points[n + 1], points[n + 2], points[n + 3], points[n + 4], points[n + 5], points[n + 6], points[n + 7]));
    }
    return extrema;
}
export class Line extends Shape {
    constructor(config) {
        super(config);
        this.on('pointsChange.konva tensionChange.konva closedChange.konva bezierChange.konva', function () {
            this._clearCache('tensionPoints');
        });
    }
    _hasTension() {
        return this.tension() !== 0 && this.points().length > 4;
    }
    _eachTensionSegment(onQuadratic, onCubic) {
        const points = this.points(), length = points.length, closed = this.closed(), tp = this.getTensionPoints(), len = tp.length;
        let x0 = points[0], y0 = points[1], n = closed ? 0 : 4;
        if (!closed) {
            onQuadratic(x0, y0, tp[0], tp[1], tp[2], tp[3]);
            x0 = tp[2];
            y0 = tp[3];
        }
        while (n < len - 2) {
            const cp1x = tp[n++], cp1y = tp[n++], cp2x = tp[n++], cp2y = tp[n++], x = tp[n++], y = tp[n++];
            onCubic(x0, y0, cp1x, cp1y, cp2x, cp2y, x, y);
            x0 = x;
            y0 = y;
        }
        if (!closed) {
            onQuadratic(x0, y0, tp[len - 2], tp[len - 1], points[length - 2], points[length - 1]);
        }
    }
    _sceneFunc(context) {
        const points = this.points(), length = points.length, closed = this.closed(), bezier = this.bezier();
        if (!length) {
            return;
        }
        let n = 0;
        context.beginPath();
        context.moveTo(points[0], points[1]);
        if (this._hasTension()) {
            this._eachTensionSegment((_x0, _y0, cpx, cpy, x, y) => context.quadraticCurveTo(cpx, cpy, x, y), (_x0, _y0, cp1x, cp1y, cp2x, cp2y, x, y) => context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y));
        }
        else if (bezier) {
            n = 2;
            while (n < length) {
                context.bezierCurveTo(points[n++], points[n++], points[n++], points[n++], points[n++], points[n++]);
            }
        }
        else {
            for (n = 2; n < length; n += 2) {
                context.lineTo(points[n], points[n + 1]);
            }
        }
        if (closed) {
            context.closePath();
            context.fillStrokeShape(this);
        }
        else {
            context.strokeShape(this);
        }
    }
    getTensionPoints() {
        return this._getCache('tensionPoints', this._getTensionPoints);
    }
    _getTensionPoints() {
        if (this.closed()) {
            return this._getTensionPointsClosed();
        }
        else {
            return expandPoints(this.points(), this.tension());
        }
    }
    _getTensionPointsClosed() {
        const p = this.points(), len = p.length, tension = this.tension(), firstControlPoints = getControlPoints(p[len - 2], p[len - 1], p[0], p[1], p[2], p[3], tension), lastControlPoints = getControlPoints(p[len - 4], p[len - 3], p[len - 2], p[len - 1], p[0], p[1], tension), middle = expandPoints(p, tension), tp = [firstControlPoints[2], firstControlPoints[3]]
            .concat(middle)
            .concat([
            lastControlPoints[0],
            lastControlPoints[1],
            p[len - 2],
            p[len - 1],
            lastControlPoints[2],
            lastControlPoints[3],
            firstControlPoints[0],
            firstControlPoints[1],
            p[0],
            p[1],
        ]);
        return tp;
    }
    getWidth() {
        return this.getSelfRect().width;
    }
    getHeight() {
        return this.getSelfRect().height;
    }
    getSelfRect() {
        let points = this.points();
        if (points.length < 4) {
            return {
                x: points[0] || 0,
                y: points[1] || 0,
                width: 0,
                height: 0,
            };
        }
        if (this._hasTension()) {
            const bounds = [points[0], points[1]];
            this._eachTensionSegment((x0, y0, cpx, cpy, x, y) => bounds.push(x, y, ...getQuadraticExtremaPoints(x0, y0, cpx, cpy, x, y)), (x0, y0, cp1x, cp1y, cp2x, cp2y, x, y) => bounds.push(x, y, ...getCubicExtremaPoints(x0, y0, cp1x, cp1y, cp2x, cp2y, x, y)));
            points = bounds;
        }
        else if (this.bezier()) {
            points = [points[0], points[1], ...getBezierExtremaPoints(points)];
        }
        let minX = points[0];
        let maxX = points[0];
        let minY = points[1];
        let maxY = points[1];
        let x, y;
        for (let i = 0; i < points.length / 2; i++) {
            x = points[i * 2];
            y = points[i * 2 + 1];
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
        };
    }
}
Line.prototype.className = 'Line';
Line.prototype._attrsAffectingSize = ['points', 'bezier', 'tension'];
_registerNode(Line);
Factory.addGetterSetter(Line, 'closed', false);
Factory.addGetterSetter(Line, 'bezier', false);
Factory.addGetterSetter(Line, 'tension', 0, getNumberValidator());
Factory.addGetterSetter(Line, 'points', [], getNumberArrayValidator());

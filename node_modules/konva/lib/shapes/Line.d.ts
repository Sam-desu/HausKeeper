import type { ShapeConfig } from '../Shape.ts';
import { Shape } from '../Shape.ts';
import type { Context } from '../Context.ts';
import type { GetSet } from '../types.ts';
export interface LineConfig extends ShapeConfig {
    points?: number[] | Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;
    tension?: number;
    closed?: boolean;
    bezier?: boolean;
}
export declare class Line<Config extends LineConfig = LineConfig> extends Shape<Config> {
    constructor(config?: Config);
    _hasTension(): boolean;
    _eachTensionSegment(onQuadratic: (x0: number, y0: number, cpx: number, cpy: number, x: number, y: number) => void, onCubic: (x0: number, y0: number, cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) => void): void;
    _sceneFunc(context: Context): void;
    getTensionPoints(): any;
    _getTensionPoints(): number[];
    _getTensionPointsClosed(): number[];
    getWidth(): number;
    getHeight(): number;
    getSelfRect(): {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    closed: GetSet<boolean, this>;
    bezier: GetSet<boolean, this>;
    tension: GetSet<number, this>;
    points: GetSet<number[], this>;
}

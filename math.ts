import { vec4, type Mat4, type Vec4 } from "./vendor/wgpu-matrix/wgpu-matrix.js";

export type Point2D = [number, number];

export function degreesToRadians(degrees: number): number {
    return degrees * Math.PI / 180;
}

export function mat4AsFloatArray(m: Mat4): Float32Array {
    if (!(m instanceof Float32Array)) {
        throw new Error(`Assertion failure, not a Float32Array!`);
    }
    return m;
}

export function pointToStr(point: Point2D): string {
    const [x, y] = point;
    return `(${x.toFixed(2)}, ${y.toFixed(2)})`
}

export function pointToVec4XZ(point: Point2D): Vec4 {
    const [x, z] = point;
    return vec4.create(x, 0, z, 1);
}

export function vec4XZToPoint(v: Vec4): Point2D {
    return [v[0] / v[3], v[2] / v[3]];
}

export function canvasSpaceToClip(canvas: HTMLCanvasElement, point: Point2D): Point2D {
    const x = (point[0] / canvas.width) * 2 - 1;
    const y = ((canvas.height - point[1]) / canvas.height) * 2 - 1;
    return [x, y]
}

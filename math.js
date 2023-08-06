import { vec4 } from "./vendor/wgpu-matrix/wgpu-matrix.js";
export function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
}
export function mat4AsFloatArray(m) {
    if (!(m instanceof Float32Array)) {
        throw new Error(`Assertion failure, not a Float32Array!`);
    }
    return m;
}
export function pointToStr(point) {
    const [x, y] = point;
    return `(${x.toFixed(2)}, ${y.toFixed(2)})`;
}
export function pointToVec4XZ(point) {
    const [x, z] = point;
    return vec4.create(x, 0, z, 1);
}
export function vec4XZToPoint(v) {
    return [v[0] / v[3], v[2] / v[3]];
}
export function canvasSpaceToClip(canvas, point) {
    const x = (point[0] / canvas.width) * 2 - 1;
    const y = ((canvas.height - point[1]) / canvas.height) * 2 - 1;
    return [x, y];
}

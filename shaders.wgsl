struct VertexOutput {
    @builtin(position) pos: vec4f,
}

@vertex
fn vertexShadowMap(@location(0) pos: vec2f) -> VertexOutput {
    var output: VertexOutput;
    output.pos = vec4f(pos.x, 0, pos.y, 1);
    return output;
}

@fragment
fn fragmentShadowMap(input: VertexOutput) -> @location(0) vec4f {
    let z = 1 - input.pos.z;
    return vec4f(z, z, z, 1);
}

@vertex
fn vertexRendering(@location(0) pos: vec2f) -> @builtin(position) vec4f {
    return vec4f(pos, 0, 1);
}

@fragment
fn fragmentRendering(@builtin(position) input: vec4f) -> @location(0) vec4f {
    return vec4f(0, 0, 0.5, 1);
}

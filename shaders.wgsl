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

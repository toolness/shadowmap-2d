struct VertexOutput {
    @builtin(position) pos: vec4f,
}

@vertex
fn vertexMain(@location(0) pos: vec2f) -> VertexOutput {
    var output: VertexOutput;
    output.pos = vec4f(pos.x, 0, pos.y, 1);
    return output;
}

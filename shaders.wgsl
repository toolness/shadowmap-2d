struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) color: vec4f,
}

@vertex
fn vertexMain(@location(0) pos: vec2f, @builtin(vertex_index) vertex: u32) -> VertexOutput {
    var output: VertexOutput;
    output.pos = vec4f(pos.x, 0, pos.y, 1);
    if vertex > 1 {
        output.color = vec4f(0, 0, 1, 1);
    } else {
        output.color = vec4f(1, 0, 0, 1);
    }
    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    return input.color;
}

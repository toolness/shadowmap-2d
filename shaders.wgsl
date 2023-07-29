@group(0) @binding(0) var shadowMapSampler: sampler;
@group(0) @binding(1) var shadowMap: texture_depth_2d;

struct ShadowMapVertexOutput {
    @builtin(position) pos: vec4f,
}

@vertex
fn vertexShadowMap(@location(0) pos: vec2f) -> ShadowMapVertexOutput {
    var output: ShadowMapVertexOutput;
    output.pos = vec4f(pos.x, 0, pos.y, 1);
    return output;
}

@fragment
fn fragmentShadowMap(input: ShadowMapVertexOutput) -> @location(0) vec4f {
    let z = 1 - input.pos.z;
    return vec4f(z, z, z, 1);
}

struct RenderingVertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f
}

@vertex
fn vertexRendering(@location(0) pos: vec2f) -> RenderingVertexOutput {
    var output: RenderingVertexOutput;
    output.pos = vec4f(pos, 0, 1);
    output.uv = (pos + 1) / 2;
    return output;
}

@fragment
fn fragmentRendering(input: RenderingVertexOutput) -> @location(0) vec4f {
    let depth = 1 - textureSample(shadowMap, shadowMapSampler, vec2(input.uv.x, 0));
    return vec4f(depth, depth, depth, 1);
}

@group(0) @binding(0) var shadowMapSampler: sampler;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var<storage, read> spotlight: Spotlight;

const PI: f32 = 3.1415926538;

struct Spotlight {
    pos: vec2<f32>,
    focal_length: f32,
    max_distance: f32,
    light_view_proj_matrix: mat4x4<f32>,
}

struct ShadowMapVertexOutput {
    @builtin(position) pos: vec4f,
}

@vertex
fn vertexShadowMap(@location(0) pos: vec2f) -> ShadowMapVertexOutput {
    let world_pos = vec4(pos.x, 0, pos.y, 1);
    let projected_light_pos = spotlight.light_view_proj_matrix * world_pos;
    var output: ShadowMapVertexOutput;
    output.pos = projected_light_pos;
    return output;
}

@fragment
fn fragmentShadowMap(input: ShadowMapVertexOutput) -> @location(0) vec4f {
    let z = input.pos.z / input.pos.w;
    return vec4f(z, z, z, 1);
}

struct RenderingVertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) clip_space_pos: vec2f
}

@vertex
fn vertexRendering(@location(0) pos: vec2f) -> RenderingVertexOutput {
    var output: RenderingVertexOutput;
    output.pos = vec4f(pos, 0, 1);

    // This looks redundant, since it's a subset of `output.pos`, but
    // `output.pos` will actually get transformed into device-space coordinates
    // by the time it reaches our fragment shader.
    output.clip_space_pos = pos;

    return output;
}

@fragment
fn fragmentRendering(input: RenderingVertexOutput) -> @location(0) vec4f {
    let world_pos = vec4(input.clip_space_pos.x, 0, input.clip_space_pos.y, 1);
    let projected_light_point = spotlight.light_view_proj_matrix * world_pos;
    let u = (projected_light_point.x / projected_light_point.w + 1) / 2;
    let depth = projected_light_point.z / projected_light_point.w;
    var is_lit: bool = false;
    let shadow_depth = textureSample(shadowMap, shadowMapSampler, vec2(u, 0));
    if (u >= 0 && u <= 1 && depth >= 0 && depth <= 1) {
        is_lit = shadow_depth > depth;
    }
    if is_lit {
        let abs_distance_from_light = distance(input.clip_space_pos, spotlight.pos);
        let distance_from_light = 1 - clamp(
            (abs_distance_from_light - spotlight.focal_length) / (spotlight.max_distance - spotlight.focal_length),
            0,
            1
        );
        return vec4f(distance_from_light, distance_from_light, distance_from_light, 1);
    } else {
        return vec4f(0, 0, 0, 1);
    }
}

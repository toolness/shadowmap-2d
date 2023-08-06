@group(0) @binding(0) var shadowMapSampler: sampler;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var<storage, read> spotlight: Spotlight;

const PI: f32 = 3.1415926538;
const SHADOW_BIAS: f32 = 0.0001;

struct Spotlight {
    pos: vec2<f32>,
    focal_length: f32,
    max_distance: f32,
    view_proj_matrix: mat4x4<f32>,
}

struct ShadowMapVertexOutput {
    @builtin(position) pos: vec4f,
}

@vertex
fn vertexShadowMap(@location(0) pos: vec2f) -> ShadowMapVertexOutput {
    let world_pos = vec4(pos.x, 0, pos.y, 1);
    let projected_light_pos = spotlight.view_proj_matrix * world_pos;
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

fn getIsLit(clip_space_pos: vec2f) -> bool {
    let world_pos = vec4(clip_space_pos.x, 0, clip_space_pos.y, 1);
    let projected_light_point = spotlight.view_proj_matrix * world_pos;
    let u = (projected_light_point.x / projected_light_point.w + 1) / 2;
    let depth = projected_light_point.z / projected_light_point.w;
    var is_lit: bool = false;
    let shadow_depth = textureSample(shadowMap, shadowMapSampler, vec2(u, 0));
    if (u >= 0 && u <= 1 && depth >= 0 && depth <= 1) {
        is_lit = shadow_depth > depth - SHADOW_BIAS;
    }
    return is_lit;
}

fn getProximityToLight(clip_space_pos: vec2f) -> f32 {
    let abs_distance_from_light = distance(clip_space_pos, spotlight.pos);
    let proximity_to_light = 1 - clamp(
        (abs_distance_from_light - spotlight.focal_length) / (spotlight.max_distance - spotlight.focal_length),
        0,
        1
    );
    return proximity_to_light;
}

@fragment
fn fragmentTriangleRendering(input: RenderingVertexOutput) -> @location(0) vec4f {
    let is_lit = getIsLit(input.clip_space_pos);
    if is_lit {
        let p = getProximityToLight(input.clip_space_pos);
        return vec4f(p, p, p, 1);
    } else {
        return vec4f(0, 0, 0, 1);
    }
}

@fragment
fn fragmentLineRendering(input: RenderingVertexOutput) -> @location(0) vec4f {
    let is_lit = getIsLit(input.clip_space_pos);
    let base_color = vec3f(1, 1, 1);
    let emission = 0.4;
    let diffuse = 1 - emission;
    if (is_lit) {
        return vec4f(base_color * emission + base_color * getProximityToLight(input.clip_space_pos) * diffuse, 1);
    } else {
        return vec4f(base_color * emission, 1);
    }
}

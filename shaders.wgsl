@group(0) @binding(0) var shadowMapSampler: sampler;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var<storage, read> spotlight: Spotlight;

const PI: f32 = 3.1415926538;

const MAX_Z_FROM_LIGHT: f32 = 2;

struct Spotlight {
    pos: vec2<f32>,
    rotation: f32,
    focal_length: f32,
    field_of_view: f32,
}

struct ShadowMapVertexOutput {
    @builtin(position) pos: vec4f,
}

@vertex
fn vertexShadowMap(@location(0) pos: vec2f) -> ShadowMapVertexOutput {
    let light_pos = clipSpaceToLight(pos);
    let projected_light_pos = lightSpaceToProjectedVec4(light_pos);
    var output: ShadowMapVertexOutput;
    output.pos = projected_light_pos;
    return output;
}

@fragment
fn fragmentShadowMap(input: ShadowMapVertexOutput) -> @location(0) vec4f {
    let z = 1 - input.pos.z;
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
    let light_point = clipSpaceToLight(input.clip_space_pos);
    let projected_light_point = lightSpaceToProjectedVec3(light_point);
    let u = (projected_light_point.x + 1) / 2;
    let depth = projected_light_point.z;
    var is_lit: bool = false;
    let shadow_depth = textureSample(shadowMap, shadowMapSampler, vec2(u, 0));
    if (u >= 0 && u <= 1 && depth >= 0 && depth <= 1) {
        is_lit = shadow_depth > depth;
    }
    if is_lit {
        let distance_from_light = 1 - clamp(distance(vec2(), light_point) / MAX_Z_FROM_LIGHT, 0, 1);
        return vec4f(distance_from_light, distance_from_light, distance_from_light, 1);
    } else {
        return vec4f(0, 0, 0, 1);
    }
}

fn clipSpaceToLight(point: vec2<f32>) -> vec2<f32> {
    let rotated = rotatePoint(point, PI / 2 - spotlight.rotation, spotlight.pos);
    let translated = rotated - spotlight.pos;
    return translated;
}

fn rotatePoint(point: vec2<f32>, angle: f32, origin: vec2<f32>) -> vec2<f32> {
    let relative_point = point - origin;
    let cos_angle = cos(angle);
    let sin_angle = sin(angle);
    let rotated_point = vec2(
        relative_point.x * cos_angle - relative_point.y * sin_angle,
        relative_point.y * cos_angle + relative_point.x * sin_angle
    );
    return rotated_point + origin;
}

fn lightSpaceToProjectedVec3(point: vec2<f32>) -> vec3<f32> {
    let p = lightSpaceToProjectedVec4(point);
    return vec3(p.x / p.w, 0, p.z / p.w);
}

fn lightSpaceToProjectedVec4(point: vec2<f32>) -> vec4<f32> {
    let half_angle = spotlight.field_of_view / 2;
    let right_extent = spotlight.focal_length * tan(half_angle);
    let scale_factor = 1 / right_extent;
    let scaled_focal_length = spotlight.focal_length * scale_factor;
    let scaled_point = point * scale_factor;
    let projected = scaled_point.x * scaled_focal_length;
    // Set W to let the GPU perform the perspective projection, as it will
    // also perform clipping if needed, deal with the situation where W is zero, etc.
    return vec4(projected, 0, point.y / MAX_Z_FROM_LIGHT * scaled_point.y, scaled_point.y);
}

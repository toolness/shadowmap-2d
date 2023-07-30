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
    let projected_light_pos = lightSpaceToProjected(light_pos);
    var output: ShadowMapVertexOutput;
    output.pos = vec4f(projected_light_pos, 1);
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

fn lightSpaceToProjected(point: vec2<f32>) -> vec3<f32> {
    let half_angle = spotlight.field_of_view / 2;
    let right_extent = spotlight.focal_length * tan(half_angle);
    let scale_factor = 1 / right_extent;
    let scaled_focal_length = spotlight.focal_length * scale_factor;
    let scaled_point = point * scale_factor;
    let projected = scaled_point.x * scaled_focal_length / scaled_point.y;
    return vec3(projected, 0, point.y / MAX_Z_FROM_LIGHT);
}

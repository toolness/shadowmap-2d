import { mat4, vec3, vec4 } from "./vendor/wgpu-matrix/wgpu-matrix.js";

const shadowMapCanvas = document.getElementById("shadow-map-canvas") as HTMLCanvasElement;
const renderingCanvas = document.getElementById("rendering-canvas") as HTMLCanvasElement;
const rotationInput = document.getElementById("rotation") as HTMLInputElement;
const focalLengthInput = document.getElementById("focal-length") as HTMLInputElement;
const fovInput = document.getElementById("fov") as HTMLInputElement;
const statsPre = document.getElementById("stats") as HTMLPreElement;
const positionPre = document.getElementById("position") as HTMLPreElement;

const SHADOW_MAP_WIDTH = shadowMapCanvas.width;
const SHADOW_MAP_HEIGHT = shadowMapCanvas.height;

const LOG_SHADOW_MAP_TO_CONSOLE = false

const SPOTLIGHT_INITIAL_POS: Point2D = [0, -1];

const WALL_VERTICES = new Float32Array([
    0.25, 0.25,
    0.75, 0.25,
    -0.25, -0.25,
    -0.75, -0.25,
    0.25, -0.25,
    0.25, -0.5,
]);

if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
}

const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "low-power"
});

if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
}

function getLabelFor(element: HTMLElement): HTMLLabelElement {
    if (!element.id) {
        throw new Error("Element does not have an ID");
    }
    const label = document.querySelector(`label[for="${element.id}"]`) as HTMLLabelElement|null;
    if (!label) {
        throw new Error(`Label not found for #${element.id}`);
    }
    return label;
}

const device = await adapter.requestDevice();

const shadowMapContext = shadowMapCanvas.getContext("webgpu")!;

const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

shadowMapContext.configure({device, format: canvasFormat});

const renderingContext = renderingCanvas.getContext("webgpu")!;

renderingContext.configure({device, format: canvasFormat});

async function fetchShader(device: GPUDevice, filename: string): Promise<GPUShaderModule> {
    const response = await fetch(filename);
    if (!response.ok) {
        throw new Error(`Fetching "${filename}" failed, status code ${response.status}`);
    }
    const code = await response.text();
    return device.createShaderModule({
        label: filename,
        code
    });
}

function degreesToRadians(degrees: number): number {
    return degrees * Math.PI / 180;
}

type Point2D = [number, number];

type Spotlight2D = {
    pos: Point2D,
    rotation: number,
    focalLength: number,
    fieldOfView: number
}

const spotlight: Spotlight2D = {
    pos: SPOTLIGHT_INITIAL_POS,
    // These values are all retrieved from the DOM.
    rotation: 0,
    focalLength: 0,
    fieldOfView: 0
}

const spotlightDataBuffer = device.createBuffer({
    label: "Spotlight data buffer",
    size: 24,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
});

function updateSpotlightFromInputs() {
    spotlight.rotation = (Math.PI / 2) - degreesToRadians(rotationInput.valueAsNumber);
    spotlight.focalLength = focalLengthInput.valueAsNumber;
    spotlight.fieldOfView = degreesToRadians(fovInput.valueAsNumber);
}

function updateSpotlightDataBuffer() {
    const SPOTLIGHT_Z_FAR = 10;
    const r = mat4.rotationY(-degreesToRadians(rotationInput.valueAsNumber));
    const t = mat4.translate(r, vec3.create(-spotlight.pos[0], 0, -spotlight.pos[1]));
    const p = mat4.perspective(spotlight.fieldOfView, 1, spotlight.focalLength, SPOTLIGHT_Z_FAR);
    const viewProjection = mat4.multiply(p, t);
    const transformedPoint = vec4.transformMat4(vec4.create(-1, 0, 0, 1), viewProjection);
    console.log(transformedPoint, transformedPoint[0] / transformedPoint[3]);

    const spotlightData = new Float32Array([
        ...spotlight.pos,
        spotlight.rotation,
        spotlight.focalLength,
        spotlight.fieldOfView,
        // Implicit struct size padding.
        0
    ]);
    device.queue.writeBuffer(spotlightDataBuffer, 0, spotlightData);
}

const shaders = await fetchShader(device, "shaders.wgsl");

/**
 * The rendering is just a square that covers the entire clip space.
 */
const renderingVertices = new Float32Array([
    // X,   Y
    -1.0,  1.0,
     1.0, -1.0,
    -1.0, -1.0,

    -1.0,  1.0,
     1.0,  1.0,
     1.0, -1.0,
]);

const renderingVertexBuffer = device.createBuffer({
    label: "Rendering vertex buffer",
    size: renderingVertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
});

device.queue.writeBuffer(renderingVertexBuffer, 0, renderingVertices);

const renderingVertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 8,
    attributes: [{
        format: "float32x2",
        offset: 0,
        shaderLocation: 0
    }]
};

const renderingSampler = device.createSampler({
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    addressModeW: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "nearest",
    lodMinClamp: 0,
    lodMaxClamp: 100
});

const renderingBindGroupLayout = device.createBindGroupLayout({
    label: "Rendering bind group layout",
    entries: [{
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {
            type: "filtering"
        }
    }, {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
            sampleType: "depth",
            viewDimension: "2d",
            multisampled: false
        }
    }, {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
            type: "read-only-storage"
        }
    }]
});

const renderingPipelineLayout = device.createPipelineLayout({
    label: "Rendering pipeline layout",
    bindGroupLayouts: [renderingBindGroupLayout]
});

const renderingPipeline = device.createRenderPipeline({
    label: "Rendering pipeline",
    layout: renderingPipelineLayout,
    vertex: {
        module: shaders,
        entryPoint: "vertexRendering",
        buffers: [renderingVertexBufferLayout]
    },
    fragment: {
        module: shaders,
        entryPoint: "fragmentRendering",
        targets: [{
            format: canvasFormat
        }],
    }
});

const wallVertexBuffer = device.createBuffer({
    label: "Wall vertex buffer",
    size: WALL_VERTICES.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
});

device.queue.writeBuffer(wallVertexBuffer, 0, WALL_VERTICES);

const wallVertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 8,
    attributes: [{
        format: "float32x2",
        offset: 0,
        shaderLocation: 0
    }]
};

const shadowMapDepthTexture = device.createTexture({
    label: "Shadow map depth texture",
    size: {
        width: SHADOW_MAP_WIDTH,
        height: SHADOW_MAP_HEIGHT,
        depthOrArrayLayers: 1
    },
    mipLevelCount: 1,
    sampleCount: 1,
    dimension: "2d",
    format: "depth32float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC
});

const shadowMapDepthTextureView = shadowMapDepthTexture.createView();

const shadowMapBindGroupLayout = device.createBindGroupLayout({
    label: "Shadow map bind group layout",
    entries: [{
        binding: 2,
        visibility: GPUShaderStage.VERTEX,
        buffer: {
            type: "read-only-storage"
        }
    }]
});

const shadowMapPipelineLayout = device.createPipelineLayout({
    label: "Shadow map pipeline layout",
    bindGroupLayouts: [shadowMapBindGroupLayout]
});

const shadowMapPipeline = device.createRenderPipeline({
    label: "Shadow map pipeline",
    layout: shadowMapPipelineLayout,
    depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "less",
    },
    primitive: {
        topology: "line-list"
    },
    vertex: {
        module: shaders,
        entryPoint: "vertexShadowMap",
        buffers: [wallVertexBufferLayout]
    },
    fragment: {
        module: shaders,
        entryPoint: "fragmentShadowMap",
        targets: [{
            format: canvasFormat
        }],
    }
});

const shadowMapStagingBufferSize = SHADOW_MAP_WIDTH * SHADOW_MAP_HEIGHT * 4;
const shadowMapStagingBuffer = LOG_SHADOW_MAP_TO_CONSOLE ? device.createBuffer({
    size: shadowMapStagingBufferSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
}) : undefined;

const shadowMapBindGroup = device.createBindGroup({
    label: "Shadow map bind group",
    layout: shadowMapBindGroupLayout,
    entries: [{
        binding: 2,
        resource: {
            buffer: spotlightDataBuffer
        }
    }]
});

const renderingBindGroup = device.createBindGroup({
    label: "Rendering bind group",
    layout: renderingBindGroupLayout,
    entries: [{
        binding: 0,
        resource: renderingSampler
    }, {
        binding: 1,
        resource: shadowMapDepthTextureView
    }, {
        binding: 2,
        resource: {
            buffer: spotlightDataBuffer
        }
    }]
});

function draw() {
    const renderStart = performance.now()

    const encoder = device.createCommandEncoder();

    const shadowMapPass = encoder.beginRenderPass({
        colorAttachments: [{
            view: shadowMapContext.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: {
                r: 0, g: 0, b: 0, a: 1
            },
            storeOp: "store"
        }],
        depthStencilAttachment: {
            view: shadowMapDepthTextureView,
            depthLoadOp: "clear",
            depthStoreOp: "store",
            depthClearValue: 1.0,
        }
    });
    shadowMapPass.setPipeline(shadowMapPipeline);
    shadowMapPass.setVertexBuffer(0, wallVertexBuffer);
    shadowMapPass.setBindGroup(0, shadowMapBindGroup);
    shadowMapPass.draw(WALL_VERTICES.length / 2);
    shadowMapPass.end();

    if (shadowMapStagingBuffer) {
        encoder.copyTextureToBuffer({
            texture: shadowMapDepthTexture
        }, {
            buffer: shadowMapStagingBuffer
        }, {
            width: SHADOW_MAP_WIDTH,
            height: SHADOW_MAP_HEIGHT,
            depthOrArrayLayers: 1
        });
    }

    const renderingPass = encoder.beginRenderPass({
        colorAttachments: [{
            view: renderingContext.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: {
                r: 0, g: 0, b: 0, a: 1
            },
            storeOp: "store"
        }],
    });
    renderingPass.setPipeline(renderingPipeline);
    renderingPass.setVertexBuffer(0, renderingVertexBuffer);
    renderingPass.setBindGroup(0, renderingBindGroup);
    renderingPass.draw(renderingVertices.length / 2);
    renderingPass.end();

    device.queue.submit([encoder.finish()]);

    device.queue.onSubmittedWorkDone().then(() => {
        const renderTime = Math.ceil(performance.now() - renderStart);
        statsPre.textContent = `Frame render time: ${renderTime} ms`;
    })

    if (shadowMapStagingBuffer) {
        device.queue.onSubmittedWorkDone().then(async () => {
            await shadowMapStagingBuffer.mapAsync(GPUMapMode.READ, 0, shadowMapStagingBufferSize);
            const copyArrayBuffer = shadowMapStagingBuffer.getMappedRange(0, shadowMapStagingBufferSize);
            const data = copyArrayBuffer.slice(0);
            shadowMapStagingBuffer.unmap();
            console.log("Shadow map depth buffer", new Float32Array(data));
        });
    }
}

function updateAndDraw() {
    updateSpotlightFromInputs();
    updateSpotlightDataBuffer();
    draw();
    getLabelFor(rotationInput).textContent = `Rotation (${rotationInput.value}°)`;
    getLabelFor(focalLengthInput).textContent = `Focal length (${focalLengthInput.value})`;
    getLabelFor(fovInput).textContent = `Field of view (${fovInput.value}°)`;
    positionPre.textContent = `Position: (${spotlight.pos[0].toFixed(2)}, ${spotlight.pos[1].toFixed(2)})`;
}

updateAndDraw();

rotationInput.oninput = updateAndDraw;
focalLengthInput.oninput = updateAndDraw;
fovInput.oninput = updateAndDraw;

/**
 * This only works if passed 1 or -1.
 */
function incrementOrDecrementRotation(delta: number) {
    let rotation = rotationInput.valueAsNumber;
    const min = parseInt(rotationInput.min);
    const max = parseInt(rotationInput.max);
    if (rotation === min && delta === -1) {
        rotation = max;
    } else if (rotation === max && delta === 1) {
        rotation = min;
    } else {
        rotation += delta;
    }
    rotationInput.valueAsNumber = rotation;
    updateAndDraw();
}

window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    const MOVE_AMOUNT = 0.05;
    let xDelta = 0;
    let yDelta = 0;
    let rotDelta = 0;
    if (key === 'w') {
        yDelta = 1;
    } else if (key === 's') {
        yDelta = -1;
    } else if (key === 'a') {
        xDelta = -1;
    } else if (key === 'd') {
        xDelta = 1;
    } else if (key === 'q') {
        rotDelta -= 1;
    } else if (key === 'e') {
        rotDelta += 1;
    }
    if (xDelta || yDelta) {
        spotlight.pos[0] += xDelta * MOVE_AMOUNT;
        spotlight.pos[1] += yDelta * MOVE_AMOUNT;
        updateAndDraw();
    } else if (rotDelta) {
        incrementOrDecrementRotation(rotDelta);
    }
});

export {}

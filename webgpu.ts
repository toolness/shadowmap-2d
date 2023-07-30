const shadowMapCanvas = document.getElementById("shadow-map-canvas") as HTMLCanvasElement;
const renderingCanvas = document.getElementById("rendering-canvas") as HTMLCanvasElement;

const RENDERING_WIDTH = renderingCanvas.width;
const RENDERING_HEIGHT = renderingCanvas.height;
const SHADOW_MAP_WIDTH = shadowMapCanvas.width;
const SHADOW_MAP_HEIGHT = shadowMapCanvas.height;

const LOG_SHADOW_MAP_TO_CONSOLE = false

if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
}

const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "low-power"
});

if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
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

type Point2D = [number, number];

type Spotlight2D = {
    pos: Point2D,
    rotation: number,
    focalLength: number,
    fieldOfView: number
}

const spotlight: Spotlight2D = {
    pos: [0, -1],
    rotation: Math.PI / 2,
    focalLength: 0.1,
    fieldOfView: Math.PI / 3
}

const spotlightDataBuffer = device.createBuffer({
    label: "Spotlight data buffer",
    size: 24,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
});

function updateSpotlightDataBuffer() {
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

const wallVertices = new Float32Array([
    0.25, 0.25,
    0.75, 0.25,
    -0.25, -0.25,
    -0.75, -0.25
]);

const wallVertexBuffer = device.createBuffer({
    label: "Wall vertex buffer",
    size: wallVertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
});

device.queue.writeBuffer(wallVertexBuffer, 0, wallVertices);

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
    shadowMapPass.draw(wallVertices.length / 2);
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

updateSpotlightDataBuffer();
draw();

export {}

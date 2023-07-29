const canvas = document.querySelector("canvas")!;

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

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

const context = canvas.getContext("webgpu")!;

const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({device, format: canvasFormat});

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

const shaders = await fetchShader(device, "shaders.wgsl");

const vertices = new Float32Array([
    0.0, 0.1,
    0.75, 0.9,
    -0.8, 0.5,
    1.0, 0.5,
]);

const vertexBuffer = device.createBuffer({
    label: "Line vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
});

device.queue.writeBuffer(vertexBuffer, 0, vertices);

const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 8,
    attributes: [{
        format: "float32x2",
        offset: 0,
        shaderLocation: 0
    }]
};

const depthTexture = device.createTexture({
    label: "Depth texture",
    size: {
        width: WIDTH,
        height: HEIGHT,
        depthOrArrayLayers: 1
    },
    mipLevelCount: 1,
    sampleCount: 1,
    dimension: "2d",
    format: "depth32float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC
});

const depthView = depthTexture.createView();

const pipeline = device.createRenderPipeline({
    label: "shadowMap",
    layout: "auto",
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
        entryPoint: "vertexMain",
        buffers: [vertexBufferLayout]
    },
    fragment: {
        module: shaders,
        entryPoint: "fragmentMain",
        targets: [{
            format: canvasFormat
        }],
    }
});

const stagingBufferSize = WIDTH * HEIGHT * 4;
const stagingBuffer = device.createBuffer({
    size: stagingBufferSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
})

function draw() {
    const encoder = device.createCommandEncoder();

    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: {
                r: 0, g: 0, b: 0, a: 1
            },
            storeOp: "store"
        }],
        depthStencilAttachment: {
            view: depthView,
            depthLoadOp: "clear",
            depthStoreOp: "store",
            depthClearValue: 1.0,
        }
    });
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(vertices.length / 2);
    pass.end();

    encoder.copyTextureToBuffer({
        texture: depthTexture
    }, {
        buffer: stagingBuffer
    }, {
        width: WIDTH,
        height: HEIGHT,
        depthOrArrayLayers: 1
    });

    device.queue.submit([encoder.finish()]);
    device.queue.onSubmittedWorkDone().then(async () => {
        await stagingBuffer.mapAsync(GPUMapMode.READ, 0, stagingBufferSize);
        const copyArrayBuffer = stagingBuffer.getMappedRange(0, stagingBufferSize);
        const data = copyArrayBuffer.slice(0);
        stagingBuffer.unmap();
        console.log("Depth buffer", new Float32Array(data));
    });
}

draw();

export {}

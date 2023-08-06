import { Point2D, mat4AsFloatArray } from "./math.js";
import { fetchShader } from "./network.js";
import { Mat4, mat4, vec3 } from "./vendor/wgpu-matrix/wgpu-matrix.js";

export type Spotlight2D = {
    pos: Point2D,
    rotation: number,
    focalLength: number,
    fieldOfView: number,
    maxDistance: number,
}

export type Line2D = {
    start: Point2D,
    end: Point2D,
};

interface RenderState {
    walls: Line2D[],
    spotlight: Spotlight2D,
    cursor: Point2D|undefined,
}

interface RenderComputedState {
    spotlight: {
        viewMatrix: Mat4,
        projectionMatrix: Mat4,
        viewProjectionMatrix: Mat4
    }
}

const VEC2_F32_SIZE = 8;
const F32_SIZE = 4;
const MAT4X4_F32_SIZE = 64;

/**
 * The rendering is just a square that covers the entire clip space.
 */
const RENDERING_VERTICES = new Float32Array([
    // X,   Y
    -1.0,  1.0,
     1.0, -1.0,
    -1.0, -1.0,
    
    -1.0,  1.0,
     1.0,  1.0,
     1.0, -1.0,
]);

function computeState(state: RenderState): RenderComputedState {
    const { spotlight } = state;

    const rotation = mat4.rotationY(-spotlight.rotation);
    const viewMatrix = mat4.translate(rotation, vec3.create(-spotlight.pos[0], 0, -spotlight.pos[1]));
    const projectionMatrix = mat4.perspective(spotlight.fieldOfView, 1, spotlight.focalLength, spotlight.maxDistance);
    const viewProjectionMatrix = mat4.multiply(projectionMatrix, viewMatrix);

    const result: RenderComputedState = {
        spotlight: {
            viewMatrix,
            projectionMatrix,
            viewProjectionMatrix
        }
    };

    return result;
}

export async function initRenderPipeline(args: {
    renderingCanvas: HTMLCanvasElement,
    shadowMapCanvas: HTMLCanvasElement,
    initialState: RenderState,
    logShadowMapToConsole?: boolean,
    onDrawFinished?: (renderTime: number) => void,
    onDrawStarted?: (state: RenderState, computedState: RenderComputedState) => void,
}) {
    const { renderingCanvas, shadowMapCanvas, logShadowMapToConsole, initialState, onDrawStarted, onDrawFinished } = args
    const SHADOW_MAP_WIDTH = shadowMapCanvas.width;
    const SHADOW_MAP_HEIGHT = shadowMapCanvas.height;

    if (!navigator.gpu) {
        throw new Error("WebGPU not supported on this browser. Try using Chrome?");
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

    const spotlightDataBuffer = device.createBuffer({
        label: "Spotlight data buffer",
        size: VEC2_F32_SIZE + F32_SIZE + F32_SIZE + MAT4X4_F32_SIZE,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
    });

    function updateSpotlightDataBuffer(state: RenderState, computedState: RenderComputedState) {
        const { spotlight } = state;
        const viewProjectionData = mat4AsFloatArray(computedState.spotlight.viewProjectionMatrix);
        // Note that we need to write data into the buffer so the elements are properly aligned:
        // https://www.w3.org/TR/WGSL/#alignment-and-size
        const spotlightData = new Float32Array([
            ...spotlight.pos,
            spotlight.focalLength,
            spotlight.maxDistance
        ]);
        device.queue.writeBuffer(spotlightDataBuffer, 0, spotlightData);
        device.queue.writeBuffer(spotlightDataBuffer, 16, viewProjectionData);
    }
    
    const shaders = await fetchShader(device, "shaders.wgsl");
    
    const renderingVertexBuffer = device.createBuffer({
        label: "Rendering vertex buffer",
        size: RENDERING_VERTICES.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    device.queue.writeBuffer(renderingVertexBuffer, 0, RENDERING_VERTICES);

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

    const initWallVertexBuffer = (state: RenderState) => {
        const { walls } = state;
        const vertices: number[] = [];
        for (const {start, end} of walls) {
            vertices.push(...start, ...end);
        }
        const array = new Float32Array(vertices);
        const buffer = device.createBuffer({
            label: "Wall vertex buffer",
            size: array.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(buffer, 0, array);
        return buffer;
    };

    let wallVertexBuffer = initWallVertexBuffer(initialState);

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
    const shadowMapStagingBuffer = logShadowMapToConsole ? device.createBuffer({
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

    function draw(state: RenderState, computedState: RenderComputedState) {
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
        shadowMapPass.draw(state.walls.length * 2);
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
        renderingPass.draw(RENDERING_VERTICES.length / 2);
        renderingPass.end();
    
        device.queue.submit([encoder.finish()]);

        onDrawStarted?.(state, computedState);

        device.queue.onSubmittedWorkDone().then(() => {
            if (onDrawFinished) {
                const renderTime = Math.ceil(performance.now() - renderStart);
                onDrawFinished(renderTime);
            }
        });

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

    const initialComputedState = computeState(initialState);
    updateSpotlightDataBuffer(initialState, initialComputedState);
    draw(initialState, initialComputedState);

    {
        let state = initialState;
        let computedState = initialComputedState;
        return {
            setState: (newState: RenderStateSetter|Partial<RenderState>) => {
                const prevState = state;
                const updates: Partial<RenderState> = typeof newState === "function" ? newState(state, computedState) : newState;
                state = {...state, ...updates};
                computedState = computeState(state);
                if (state.spotlight !== prevState.spotlight) {
                    updateSpotlightDataBuffer(state, computedState);
                }
                if (state.walls !== prevState.walls) {
                    wallVertexBuffer.destroy();
                    wallVertexBuffer = initWallVertexBuffer(state);
                }
                draw(state, computedState);
            },
        }
    }
}

type RenderStateSetter = (state: RenderState, computedState: RenderComputedState) => Partial<RenderState>;

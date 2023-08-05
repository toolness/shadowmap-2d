import { getElement, getLabelFor } from "./dom.js";
import { degreesToRadians, pointToVec4XZ, pointToStr, vec4XZToPoint, Point2D, canvasSpaceToClip } from "./math.js";
import { Line2D, Spotlight2D, initRenderPipeline } from "./render.js";
import { vec4 } from "./vendor/wgpu-matrix/wgpu-matrix.js";

const shadowMapCanvas = getElement("canvas", "shadow-map-canvas");
const renderingCanvas = getElement("canvas", "rendering-canvas");
const rotationInput = getElement("input", "rotation");
const focalLengthInput = getElement("input", "focal-length");
const maxDistanceInput = getElement("input", "max-distance");
const fovInput = getElement("input", "fov");
const renderingStatsPre = getElement("pre", "rendering-stats");
const shadowMapStatsPre = getElement("pre", "shadow-map-stats");
const statsPre = getElement("pre", "stats");
const fatalErrorDiv = getElement("div", "fatal-error");

const RENDERING_WIDTH = renderingCanvas.width;
const RENDERING_HEIGHT = renderingCanvas.height;
const SHADOW_MAP_WIDTH = shadowMapCanvas.width;
const SHADOW_MAP_HEIGHT = shadowMapCanvas.height;

const LOG_SHADOW_MAP_TO_CONSOLE = false;

const SPOTLIGHT_INITIAL_POS: Point2D = [0, -1];

const WALLS: Line2D[] = [
    {start: [0.25, 0.25], end: [0.75, 0.25]},
    {start: [-0.25, -0.25], end: [-0.75, -0.25]},
    {start: [0.25, -0.25], end: [0.25, -0.5]},
];

window.onerror = (e) => {
    fatalErrorDiv.textContent += `${e.toString()}\n`;
    fatalErrorDiv.classList.remove("hidden");
}

const renderPipeline = await initRenderPipeline({
    renderingCanvas,
    shadowMapCanvas,
    logShadowMapToConsole: LOG_SHADOW_MAP_TO_CONSOLE,
    initialState: {
        walls: WALLS,
        spotlight: {
            pos: SPOTLIGHT_INITIAL_POS,
            ...getSpotlightStateFromInputs()
        },
        cursor: undefined,
    },
    onDrawStarted(state, computedState) {
        getLabelFor(rotationInput).textContent = `Spotlight rotation (${rotationInput.value}°)`;
        getLabelFor(focalLengthInput).textContent = `Spotight focal length (${focalLengthInput.value})`;
        getLabelFor(maxDistanceInput).textContent = `Spotlight max distance (${maxDistanceInput.value})`;
        getLabelFor(fovInput).textContent = `Spotlight field of view (${fovInput.value}°)`;
        let cursorStats = ['', '', '']
        if (state.cursor) {
            const worldPos = pointToVec4XZ(state.cursor);
            const lightPos = vec4.transformMat4(worldPos, computedState.spotlight.viewMatrix);
            const projectedLightPos = vec4.transformMat4(worldPos, computedState.spotlight.viewProjectionMatrix);
            cursorStats = [
                `Cursor position: ${pointToStr(state.cursor)}`,
                `  in light space: ${pointToStr(vec4XZToPoint(lightPos))}`,
                `  in projected light space: ${pointToStr(vec4XZToPoint(projectedLightPos))}`
            ];
        }
        renderingStatsPre.textContent = [
            `Spotlight position: ${pointToStr(state.spotlight.pos)}`,
            ...cursorStats,
            `Rendering size: ${RENDERING_WIDTH}x${RENDERING_HEIGHT} px`,
        ].join('\n');
    },
    onDrawFinished(renderTime) {
        statsPre.textContent = `Total WebGPU frame render time: ${renderTime} ms`;
    },
});

function getSpotlightStateFromInputs(): Omit<Spotlight2D, "pos"> {
    return {
        rotation: degreesToRadians(rotationInput.valueAsNumber),
        focalLength: focalLengthInput.valueAsNumber,
        maxDistance: maxDistanceInput.valueAsNumber,
        fieldOfView: degreesToRadians(fovInput.valueAsNumber),
    };
}

function handleInputChange() {
    renderPipeline.setState(state => ({
        ...state,
        spotlight: {
            ...state.spotlight,
            ...getSpotlightStateFromInputs()
        }
    }));
}

rotationInput.oninput = handleInputChange;
focalLengthInput.oninput = handleInputChange;
maxDistanceInput.oninput = handleInputChange;
fovInput.oninput = handleInputChange;

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
    handleInputChange();
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
        renderPipeline.setState(state => ({
            ...state,
            spotlight: {
                ...state.spotlight,
                pos: [
                    state.spotlight.pos[0] + xDelta * MOVE_AMOUNT,
                    state.spotlight.pos[1] + yDelta * MOVE_AMOUNT,
                ]
            }
        }));
    } else if (rotDelta) {
        incrementOrDecrementRotation(rotDelta);
    }
});

shadowMapStatsPre.textContent = `Shadow map size: ${SHADOW_MAP_WIDTH}x${SHADOW_MAP_HEIGHT} px`;

renderingCanvas.addEventListener("mousemove", event => {
    renderPipeline.setState(state => ({
        ...state,
        cursor: canvasSpaceToClip(renderingCanvas, [event.offsetX, event.offsetY]),
    }));
});

renderingCanvas.addEventListener("mouseout", event => {
   renderPipeline.setState(state => ({
        ...state,
        cursor: undefined
    }));
});

export {}

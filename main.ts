import { getElement, getLabelFor } from "./dom.js";
import { degreesToRadians, pointToVec4XZ, pointToStr, vec4XZToPoint, Point2D, canvasSpaceToClip, radiansToDegrees } from "./math.js";
import { Line2D, Spotlight2D, initRenderPipeline } from "./render.js";
import { vec4 } from "./vendor/wgpu-matrix/wgpu-matrix.js";

const shadowMapCanvas = getElement("canvas", "shadow-map-canvas");
const renderingCanvas = getElement("canvas", "rendering-canvas");
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

const SPOTLIGHT_INITIAL_POS: Point2D = [0, 1];
const SPOTLIGHT_INITIAL_ROTATION = 0;

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
            rotation: SPOTLIGHT_INITIAL_ROTATION,
            ...getSpotlightStateFromInputs()
        },
        cursor: undefined,
    },
    onDrawStarted(state, computedState) {
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
            `Spotlight rotation: ${radiansToDegrees(state.spotlight.rotation).toFixed(0)}°`,
            ...cursorStats,
            `Rendering size: ${RENDERING_WIDTH}x${RENDERING_HEIGHT} px`,
        ].join('\n');
    },
    onDrawFinished(renderTime) {
        statsPre.textContent = `Total WebGPU frame render time: ${renderTime} ms`;
    },
});

function getSpotlightStateFromInputs(): Omit<Spotlight2D, "pos"|"rotation"> {
    return {
        focalLength: focalLengthInput.valueAsNumber,
        maxDistance: maxDistanceInput.valueAsNumber,
        fieldOfView: degreesToRadians(fovInput.valueAsNumber),
    };
}

function handleInputChange() {
    renderPipeline.setState(state => ({
        spotlight: {
            ...state.spotlight,
            ...getSpotlightStateFromInputs()
        }
    }));
}

focalLengthInput.oninput = handleInputChange;
maxDistanceInput.oninput = handleInputChange;
fovInput.oninput = handleInputChange;

let keymap: { [key: string]: boolean|undefined } = {};
let isMouseDown = false;

window.addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    delete keymap[key];
});

window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    keymap[key] = true;
});

function getAnimationFromKeymap() {
    let xDelta = 0;
    let yDelta = 0;
    let rotDelta = 0;
    if (keymap['w']) {
        yDelta = 1;
    } else if (keymap['s']) {
        yDelta = -1;
    }
    if (keymap['a']) {
        xDelta = -1;
    } else if (keymap['d']) {
        xDelta = 1;
    }
    if (keymap['q']) {
        rotDelta -= 1;
    } else if (keymap['e']) {
        rotDelta += 1;
    }
    return {xDelta, yDelta, rotDelta}
}

const VELOCITY = 0.5;

const ANGULAR_VELOCITY = 1;

function animate(args: {xDelta: number, yDelta: number, rotDelta: number, timeDelta: number}) {
    const {xDelta, yDelta, rotDelta, timeDelta} = args;
    if (!xDelta && !yDelta && !rotDelta) {
        return;
    }
    renderPipeline.setState(({spotlight}) => {
        const pos: Point2D = [
            spotlight.pos[0] + xDelta * VELOCITY * timeDelta,
            spotlight.pos[1] + yDelta * VELOCITY * timeDelta,
        ];
        const rotation = spotlight.rotation + rotDelta * ANGULAR_VELOCITY * timeDelta;
        return {
            spotlight: {
                ...spotlight,
                pos,
                rotation
            }
        };
    });
}

let lastFrame = performance.now();

function updateKeymapAndAnimate() {
    let now = performance.now();
    let timeDelta = (now - lastFrame) / 1000;
    lastFrame = now;
    animate({
        ...getAnimationFromKeymap(),
        timeDelta
    });
    window.requestAnimationFrame(updateKeymapAndAnimate);
}

window.requestAnimationFrame(updateKeymapAndAnimate);

shadowMapStatsPre.textContent = `Shadow map size: ${SHADOW_MAP_WIDTH}x${SHADOW_MAP_HEIGHT} px`;

renderingCanvas.addEventListener("mousedown", event => {
    if (event.button === 0) {
        const cursor = canvasSpaceToClip(renderingCanvas, [event.offsetX, event.offsetY]);
        isMouseDown = true;
        renderPipeline.setState(state => ({
            walls: [
                ...state.walls,
                {start: cursor, end: cursor}
            ]
        }));
    }
});

renderingCanvas.addEventListener("mouseup", event => {
    if (event.button === 0) {
        isMouseDown = false;
    }
});

renderingCanvas.addEventListener("mousemove", event => {
    const cursor = canvasSpaceToClip(renderingCanvas, [event.offsetX, event.offsetY]);
    if (isMouseDown) {
        renderPipeline.setState(state => {
            const lastWall = state.walls[state.walls.length - 1];
            return {
                walls: [
                    ...state.walls.slice(0, -1),
                    {
                        start: lastWall.start,
                        end: cursor
                    }
                ],
                cursor
            }
        });
    } else {
        renderPipeline.setState({
            cursor,
        });
    }
});

renderingCanvas.addEventListener("mouseout", event => {
    renderPipeline.setState({
        cursor: undefined
    });
});

export {}

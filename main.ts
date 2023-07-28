type Point2D = [number, number];

interface Line2D {
    start: Point2D,
    end: Point2D
}

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const textDisplay = document.getElementById("display") as HTMLPreElement;

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const WALL_STROKE = "yellow";
const SPOTLIGHT_STROKE = "white";
const SPOTLIGHT_POINT_RADIUS = 2;
const SPOTLIGHT_MAX_LEN = 10;

const WALLS: Line2D[] = [
    {start: [0.25, 0.25], end: [0.75, 0.25]},
    {start: [-0.25, -0.25], end: [-0.75, -0.25]},
]

type Spotlight2D = {
    pos: Point2D,
    rotation: number,
    focalLength: number,
    fieldOfView: number
}

const SPOTLIGHT: Spotlight2D = {
    pos: [0, -1],
    rotation: Math.PI / 4,
    focalLength: 0.1,
    fieldOfView: Math.PI / 3
}

interface State {
    cursor: Point2D|undefined
}

const state: State = {
    cursor: undefined
}

function drawCanvas() {
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);    
    for (const line of WALLS) {
        drawWall(ctx, line);
    }
    drawSpotlight(ctx, SPOTLIGHT);
}

function pointToStr([x, y]: Point2D): string {
    return `(${x}, ${y})`
}

function updateTextDisplay() {
    if (state.cursor) {
        const [x, y] = state.cursor;
        textDisplay.textContent = [
            `clip space: ${pointToStr(state.cursor)}`,
            `light space: ${pointToStr(clipSpaceToLight(state.cursor))}`,
        ].join('\n');
    } else {
        textDisplay.textContent = "";
    }
}

function update() {
    drawCanvas();
    updateTextDisplay();
}

function clipSpaceToCanvas(point: Point2D): Point2D {
    const x = (point[0] + 1) / 2 * WIDTH;
    const y = (-point[1] + 1) / 2 * HEIGHT;
    return [x, y]
}

function canvasSpaceToClip(point: Point2D): Point2D {
    const x = (point[0] / WIDTH) * 2 - 1;
    const y = ((HEIGHT - point[1]) / HEIGHT) * 2 - 1;
    return [x, y]
}

function clipSpaceToLight(point: Point2D): Point2D {
    const rotated = rotatePoint(point, Math.PI / 2 - SPOTLIGHT.rotation, SPOTLIGHT.pos);
    const translated = subtractPoints(rotated, SPOTLIGHT.pos);
    return translated;
}

function clipPointFromMouseEvent(event: MouseEvent): Point2D {
    return canvasSpaceToClip([event.offsetX, event.offsetY]);
}

function drawLine(ctx: CanvasRenderingContext2D, line: Line2D) {
    ctx.beginPath();
    ctx.moveTo(...clipSpaceToCanvas(line.start));
    ctx.lineTo(...clipSpaceToCanvas(line.end));
    ctx.stroke();
}

function drawWall(ctx: CanvasRenderingContext2D, wall: Line2D) {
    ctx.strokeStyle = WALL_STROKE;
    drawLine(ctx, wall);
}

function drawSpotlight(ctx: CanvasRenderingContext2D, light: Spotlight2D) {
    ctx.strokeStyle = SPOTLIGHT_STROKE;
    ctx.beginPath();
    ctx.arc(...clipSpaceToCanvas(light.pos), SPOTLIGHT_POINT_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    const direction: Point2D = rotatePoint([1, 0], light.rotation, [0, 0]);
    const ahead = addPoints(light.pos, multiply(normalize(direction), SPOTLIGHT_MAX_LEN));
    const leftFOV = rotatePoint(ahead, light.fieldOfView / 2, light.pos);
    drawLine(ctx, {start: light.pos, end: leftFOV});
    const rightFOV = rotatePoint(ahead, -light.fieldOfView / 2, light.pos);
    drawLine(ctx, {start: light.pos, end: rightFOV});

    const aheadFocalLen = addPoints(light.pos, multiply(normalize(direction), light.focalLength));
    const leftFocalLen = rotatePoint(aheadFocalLen, light.fieldOfView / 2, light.pos);
    const rightFocalLen = rotatePoint(aheadFocalLen, -light.fieldOfView / 2, light.pos);
    drawLine(ctx, {start: leftFocalLen, end: rightFocalLen});
}

function normalize(point: Point2D): Point2D {
    const len = Math.sqrt(point[0] * point[0] + point[1] * point[1])
    return [point[0] / len, point[1] / len]
}

function multiply(point: Point2D, amount: number): Point2D {
    return [point[0] * amount, point[1] * amount]
}

function rotatePoint(point: Point2D, angle: number, origin: Point2D): Point2D {
    const relativePoint = subtractPoints(point, origin);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotatedPoint: Point2D = [
        relativePoint[0] * cos - relativePoint[1] * sin,
        relativePoint[1] * cos + relativePoint[0] * sin,
    ];
    return addPoints(rotatedPoint, origin);
}

function negatePoint(point: Point2D): Point2D {
    return [-point[0], -point[1]]
}

function subtractPoints(a: Point2D, b: Point2D): Point2D {
    return addPoints(a, negatePoint(b))
}

function addPoints(a: Point2D, b: Point2D): Point2D {
    return [a[0] + b[0], a[1] + b[1]]
}

update();

canvas.addEventListener("mousemove", event => {
    state.cursor = clipPointFromMouseEvent(event);
    update();
});

canvas.addEventListener("mouseout", event => {
    state.cursor = undefined;
    update();
})

export default {}

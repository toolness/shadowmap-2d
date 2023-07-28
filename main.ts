type Point2D = [number, number];

interface Line2D {
    start: Point2D,
    end: Point2D
}

const canvas = document.getElementById("canvas") as HTMLCanvasElement;

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
    direction: Point2D,
    focalLength: number,
    fieldOfView: number
}

const SPOTLIGHT: Spotlight2D = {
    pos: [0, -1],
    direction: [0, 1],
    focalLength: 0.1,
    fieldOfView: Math.PI / 3
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

function convertPoint(point: Point2D): Point2D {
    const x = (point[0] + 1) / 2 * WIDTH;
    const y = (-point[1] + 1) / 2 * HEIGHT;
    return [x, y]
}

function drawLine(ctx: CanvasRenderingContext2D, line: Line2D) {
    ctx.beginPath();
    ctx.moveTo(...convertPoint(line.start));
    ctx.lineTo(...convertPoint(line.end));
    ctx.stroke();
}

function drawWall(ctx: CanvasRenderingContext2D, wall: Line2D) {
    ctx.strokeStyle = WALL_STROKE;
    drawLine(ctx, wall);
}

function drawSpotlight(ctx: CanvasRenderingContext2D, light: Spotlight2D) {
    ctx.strokeStyle = SPOTLIGHT_STROKE;
    ctx.beginPath();
    ctx.arc(...convertPoint(light.pos), SPOTLIGHT_POINT_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    const ahead = addPoints(light.pos, multiply(normalize(light.direction), SPOTLIGHT_MAX_LEN));
    const leftFOV = rotatePoint(ahead, light.fieldOfView / 2, light.pos);
    drawLine(ctx, {start: light.pos, end: leftFOV});
    const rightFOV = rotatePoint(ahead, -light.fieldOfView / 2, light.pos);
    drawLine(ctx, {start: light.pos, end: rightFOV});

    const aheadFocalLen = addPoints(light.pos, multiply(normalize(light.direction), light.focalLength));
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

drawCanvas();

export default {}

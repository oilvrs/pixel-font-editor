/**
 * Contour tracing: turns a pixel grid into closed polygons that follow the
 * pixel edges. Pure logic, no DOM dependencies.
 *
 * Every filled pixel contributes the sides that face an empty pixel (or the
 * grid edge), directed clockwise around the pixel as seen on screen. The
 * edges are then linked into loops. Because every edge keeps the filled
 * side on the same hand, outer contours run clockwise and holes run
 * counter-clockwise automatically.
 *
 * Pixels that only touch at a corner are separate shapes: at such a vertex
 * the trace always takes the right turn.
 *
 * Coordinates are pixel corners, x to the right and y downwards, from
 * (0, 0) to (size, size). Contours only contain corner points, so straight
 * runs are already merged.
 *
 * @version 0.1.0
 */

import { getPixel } from './grid.js'

const EAST = 0
const SOUTH = 1
const WEST = 2
const NORTH = 3

const DELTA_X = [1, 0, -1, 0]
const DELTA_Y = [0, 1, 0, -1]

// Turns to try at a vertex, in order: right, straight, left (directions are clockwise)
const TURN_ORDER = [1, 0, 3]

/**
 * Signed area of a polygon (shoelace formula). Positive for clockwise
 * contours on screen, negative for counter-clockwise ones.
 * @param {Object[]} points - [{ x, y }]
 * @returns {number}
 */
function signedArea(points) {
  let sum = 0

  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }

  return sum / 2
}

/**
 * Traces every contour of a grid.
 * @param {Object} grid - { size, pixels }
 * @returns {Object[]} [{ points: [{ x, y }], area, isHole }]
 */
export function traceGrid(grid) {
  const stride = grid.size + 1 // Vertices per row
  const edges = new Uint8Array(stride * stride * 4) // 1 where a directed edge starts
  const visited = new Uint8Array(stride * stride * 4)

  const slot = (vx, vy, direction) => (vy * stride + vx) * 4 + direction

  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      if (!getPixel(grid, x, y)) continue

      if (!getPixel(grid, x, y - 1)) edges[slot(x, y, EAST)] = 1
      if (!getPixel(grid, x + 1, y)) edges[slot(x + 1, y, SOUTH)] = 1
      if (!getPixel(grid, x, y + 1)) edges[slot(x + 1, y + 1, WEST)] = 1
      if (!getPixel(grid, x - 1, y)) edges[slot(x, y + 1, NORTH)] = 1
    }
  }

  /**
   * Picks the edge to follow out of a vertex: right turn first, then
   * straight, then left.
   */
  const nextDirection = (vx, vy, incoming) => {
    for (const turn of TURN_ORDER) {
      const direction = (incoming + turn) % 4
      if (edges[slot(vx, vy, direction)]) return direction
    }
    return -1
  }

  const traceLoop = (startX, startY, startDirection) => {
    const points = []
    let x = startX
    let y = startY
    let direction = startDirection

    do {
      visited[slot(x, y, direction)] = 1
      x += DELTA_X[direction]
      y += DELTA_Y[direction]

      const next = nextDirection(x, y, direction)
      if (next === -1) throw new Error('Broken contour: no edge leaves the vertex')

      if (next !== direction) points.push({ x, y }) // A corner
      direction = next
    } while (x !== startX || y !== startY || direction !== startDirection)

    const area = signedArea(points)
    return { points, area, isHole: area < 0 }
  }

  const contours = []

  for (let vy = 0; vy < stride; vy++) {
    for (let vx = 0; vx < stride; vx++) {
      for (let direction = 0; direction < 4; direction++) {
        const index = slot(vx, vy, direction)
        if (!edges[index] || visited[index]) continue
        contours.push(traceLoop(vx, vy, direction))
      }
    }
  }

  return contours
}

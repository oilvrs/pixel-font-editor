/**
 * Vector shapes that sit on top of the pixels of a glyph.
 * Pure logic, no DOM dependencies.
 *
 * A shape is { type, cx, cy, w, h, angle }, the same transform as the
 * floating pixels use (see transform.js): center, size in cells (a negative
 * value mirrors that axis) and clockwise rotation in radians.
 *
 * Every type is defined in a unit square with y downwards. The right angle
 * of quarter, concave and triangle is at the top left corner. Outlines
 * are closed and run clockwise on screen. A mirrored shape is reversed, so
 * outlines always run the same way and overlapping shapes add up.
 *
 * Contour: { start: { x, y }, segments: [{ to } | { c1, c2, to }], smooth }
 * A segment with c1 and c2 is a cubic Bézier curve, otherwise a straight
 * line. The last segment ends at the start. `smooth` means the points
 * between curves are smooth (ellipse).
 *
 * @version 0.1.0
 */

import { toLocal, fromLocal } from './transform.js'

export const SHAPE_TYPES = Object.freeze(['rect', 'ellipse', 'quarter', 'concave', 'triangle'])

const K = 0.5522847498307936 // Control point distance for a quarter circle drawn with a cubic Bézier

const line = (x, y) => ({ to: { x, y } })
const curve = (x1, y1, x2, y2, x, y) => ({ c1: { x: x1, y: y1 }, c2: { x: x2, y: y2 }, to: { x, y } })

const UNIT_CONTOURS = {
  rect: {
    start: { x: 0, y: 0 },
    segments: [line(1, 0), line(1, 1), line(0, 1), line(0, 0)],
    smooth: false
  },
  ellipse: {
    start: { x: 1, y: 0.5 },
    segments: [
      curve(1, 0.5 + 0.5 * K, 0.5 + 0.5 * K, 1, 0.5, 1),
      curve(0.5 - 0.5 * K, 1, 0, 0.5 + 0.5 * K, 0, 0.5),
      curve(0, 0.5 - 0.5 * K, 0.5 - 0.5 * K, 0, 0.5, 0),
      curve(0.5 + 0.5 * K, 0, 1, 0.5 - 0.5 * K, 1, 0.5)
    ],
    smooth: true
  },
  quarter: {
    start: { x: 0, y: 0 },
    segments: [line(1, 0), curve(1, K, K, 1, 0, 1), line(0, 0)], // A quarter disc with its center at the corner (0, 0)
    smooth: false
  },
  concave: {
    start: { x: 0, y: 0 },
    segments: [line(1, 0), curve(1 - K, 0, 0, 1 - K, 0, 1), line(0, 0)], // The square minus a quarter disc centered at (1, 1)
    smooth: false
  },
  triangle: {
    start: { x: 0, y: 0 },
    segments: [line(1, 0), line(0, 1), line(0, 0)],
    smooth: false
  }
}

/**
 * Reverses the direction of a contour.
 * @param {Object} contour
 * @returns {Object}
 */
export function reverseContour(contour) {
  const points = [contour.start, ...contour.segments.map((segment) => segment.to)]
  const segments = []

  for (let i = contour.segments.length - 1; i >= 0; i--) {
    const segment = contour.segments[i]
    const to = points[i]
    segments.push(segment.c1 ? { c1: segment.c2, c2: segment.c1, to } : { to })
  }

  return { start: points[points.length - 1], segments, smooth: contour.smooth }
}

/**
 * The outline of a shape in grid coordinates (cells, y downwards), with the
 * size, mirroring and rotation of the shape applied. Always clockwise on
 * screen.
 * @param {Object} shape
 * @returns {Object} contour
 */
export function shapeContour(shape) {
  const unit = UNIT_CONTOURS[shape.type]
  const map = (p) => fromLocal(shape, (p.x - 0.5) * shape.w, (p.y - 0.5) * shape.h)

  const contour = {
    start: map(unit.start),
    segments: unit.segments.map((segment) =>
      segment.c1 ? { c1: map(segment.c1), c2: map(segment.c2), to: map(segment.to) } : { to: map(segment.to) }
    ),
    smooth: unit.smooth
  }

  return shape.w * shape.h < 0 ? reverseContour(contour) : contour // Mirroring in one axis reverses the direction
}

/**
 * Turns a contour into a list of points, with every curve cut into short
 * straight pieces.
 * @param {Object} contour
 * @param {number} steps - pieces per curve
 * @returns {Object[]} [{ x, y }]
 */
export function flattenContour(contour, steps = 16) {
  const points = [contour.start]
  let from = contour.start

  for (const segment of contour.segments) {
    if (segment.c1) {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const u = 1 - t
        points.push({
          x: u * u * u * from.x + 3 * u * u * t * segment.c1.x + 3 * u * t * t * segment.c2.x + t * t * t * segment.to.x,
          y: u * u * u * from.y + 3 * u * u * t * segment.c1.y + 3 * u * t * t * segment.c2.y + t * t * t * segment.to.y
        })
      }
    } else {
      points.push(segment.to)
    }

    from = segment.to
  }

  return points
}

/**
 * The rectangle a shape covers, in grid coordinates.
 * @param {Object} shape
 * @returns {Object} { minX, minY, maxX, maxY }
 */
export function shapeBounds(shape) {
  const points = flattenContour(shapeContour(shape))

  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y))
  }
}

/**
 * Checks if a position is inside the filled part of a shape.
 * @param {Object} shape
 * @param {number} gx - grid x
 * @param {number} gy - grid y
 * @returns {boolean}
 */
export function shapeContains(shape, gx, gy) {
  const local = toLocal(shape, gx, gy)
  const u = local.x / shape.w + 0.5
  const v = local.y / shape.h + 0.5

  if (u < 0 || u > 1 || v < 0 || v > 1) return false

  switch (shape.type) {
    case 'ellipse':
      return (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25
    case 'quarter':
      return u * u + v * v <= 1
    case 'concave':
      return (u - 1) ** 2 + (v - 1) ** 2 >= 1
    case 'triangle':
      return u + v <= 1
    default:
      return true
  }
}

/**
 * Moves, scales and rotates a shape together with the group it belongs to.
 * The group goes from the frame `from` ({ cx, cy, w, h }, not rotated) to the
 * frame `to` ({ cx, cy, w, h, angle }): it is scaled around its center,
 * rotated, then moved.
 *
 * Exact for shapes turned in steps of 90°. A non-uniform scale of a shape at
 * another angle would shear it, which a shape cannot represent. Then the
 * shape is stretched along its own axes by the lengths those axes get.
 * @param {Object} shape
 * @param {Object} from - { cx, cy, w, h }
 * @param {Object} to - { cx, cy, w, h, angle }
 * @returns {Object} the transformed shape
 */
export function transformShape(shape, from, to) {
  const sx = to.w / from.w
  const sy = to.h / from.h
  const cos = Math.cos(to.angle)
  const sin = Math.sin(to.angle)

  const turn = (x, y) => ({ x: x * cos - y * sin, y: x * sin + y * cos })

  const moved = turn((shape.cx - from.cx) * sx, (shape.cy - from.cy) * sy)

  // The shape's own x and y axes after scaling and rotation
  const ux = Math.cos(shape.angle)
  const uy = Math.sin(shape.angle)
  const ex = turn(ux * sx, uy * sy)
  const ey = turn(-uy * sx, ux * sy)

  const mirrored = sx * sy < 0 // A mirrored group mirrors the shape in one axis

  return {
    type: shape.type,
    cx: to.cx + moved.x,
    cy: to.cy + moved.y,
    w: shape.w * Math.hypot(ex.x, ex.y),
    h: (mirrored ? -1 : 1) * shape.h * Math.hypot(ey.x, ey.y),
    angle: Math.atan2(ex.y, ex.x)
  }
}

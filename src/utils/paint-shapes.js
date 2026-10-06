/**
 * Draws shapes on a canvas. Needs the DOM (canvas), so it lives in utils.
 * All shapes are put in one path, so shapes that overlap merge into one
 * when it is filled.
 *
 * @version 0.2.0
 */

import { shapeContour } from '../core/shapes.js'

/**
 * Puts shapes in the current path of a canvas without drawing them, so the
 * caller can fill or stroke it.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object[]} shapes
 * @param {Object} options
 * @param {number} options.scale - canvas px per grid cell
 * @param {number} options.x - canvas px of the grid's left edge
 * @param {number} options.y - canvas px of the grid's top edge
 */
export function traceShapes(ctx, shapes, { scale, x = 0, y = 0 }) {
  const at = (p) => [x + p.x * scale, y + p.y * scale]

  ctx.beginPath()

  for (const shape of shapes) {
    const contour = shapeContour(shape)
    ctx.moveTo(...at(contour.start))

    for (const segment of contour.segments) {
      if (segment.c1) ctx.bezierCurveTo(...at(segment.c1), ...at(segment.c2), ...at(segment.to))
      else ctx.lineTo(...at(segment.to))
    }

    ctx.closePath()
  }
}

/**
 * Fills shapes with the current fill style.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object[]} shapes
 * @param {Object} options - { scale, x, y }, see traceShapes
 */
export function paintShapes(ctx, shapes, options) {
  if (!shapes || shapes.length === 0) return

  traceShapes(ctx, shapes, options)
  ctx.fill()
}

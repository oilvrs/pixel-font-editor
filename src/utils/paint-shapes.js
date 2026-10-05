/**
 * Draws shapes on a canvas. Needs the DOM (canvas), so it lives in utils.
 * All shapes are drawn as one path in the current fill style, so shapes
 * that overlap merge into one.
 *
 * @version 0.1.0
 */

import { shapeContour } from '../core/shapes.js'

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object[]} shapes
 * @param {Object} options
 * @param {number} options.scale - canvas px per grid cell
 * @param {number} options.x - canvas px of the grid's left edge
 * @param {number} options.y - canvas px of the grid's top edge
 */
export function paintShapes(ctx, shapes, { scale, x = 0, y = 0 }) {
  if (!shapes || shapes.length === 0) return

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

  ctx.fill()
}

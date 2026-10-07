/**
 * SVG export of one glyph.
 * Pure logic, no DOM dependencies.
 *
 * The grid is the full em box. Contours come from trace.js (pixels) and
 * shapes.js (shapes) and are scaled to font units (UPM / grid size per
 * pixel). Each contour is one subpath of a single <path>. Directions are
 * reversed compared to the screen, so outer contours run counter-clockwise
 * and holes clockwise (PostScript direction). Shapes are curves (C) or
 * lines. The fill rule is nonzero, so shapes that overlap pixels or each
 * other merge.
 *
 * Horizontal position: where the letter is drawn in the grid does not
 * matter. The export moves everything so its left edge is at the left
 * sidebearing, and the viewBox width (the advance width) is the left
 * sidebearing, the width of pixels and shapes, and the right sidebearing.
 * A sidebearing that has not been set is the automatic `margin`.
 *
 * origin 'baseline': (0, 0) is on the baseline, y runs downwards, so
 * everything above the baseline has negative y. The viewBox starts at the
 * ascender.
 * origin 'top': (0, 0) is the top left corner of the em box.
 *
 * @version 0.4.0
 */

import { traceGrid } from './trace.js'
import { getMetrics, unitsPerPixel } from '../metrics.js'
import { inkBounds } from './glyph.js'
import { effectiveSpacing } from './spacing.js'
import { shapeContour, reverseContour } from './shapes.js'

export { inkBounds }

/**
 * Writes one pixel contour as a path. Corners alternate between horizontal
 * and vertical moves, so H and V commands are enough.
 * @param {Object[]} points - corner points [{ x, y }]
 * @param {Function} toX - converts a pixel x to font units
 * @param {Function} toY - converts a pixel y to font units
 * @returns {string}
 */
function contourPath(points, toX, toY) {
  let d = `M${toX(points[0].x)} ${toY(points[0].y)}`

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]
    const point = points[i]
    d += point.y === previous.y ? ` H${toX(point.x)}` : ` V${toY(point.y)}`
  }

  return `${d} Z`
}

/**
 * Writes one shape as a path of lines and curves.
 * @param {Object} shape
 * @param {Function} toX
 * @param {Function} toY
 * @returns {string}
 */
function shapePath(shape, toX, toY) {
  const contour = reverseContour(shapeContour(shape))
  let d = `M${toX(contour.start.x)} ${toY(contour.start.y)}`

  for (const segment of contour.segments) {
    if (segment.c1) {
      d += ` C${toX(segment.c1.x)} ${toY(segment.c1.y)} ${toX(segment.c2.x)} ${toY(segment.c2.y)} ${toX(segment.to.x)} ${toY(segment.to.y)}`
    } else {
      d += ` L${toX(segment.to.x)} ${toY(segment.to.y)}`
    }
  }

  return `${d} Z`
}

/**
 * Builds the SVG file content for a glyph.
 * @param {Object} grid - { size, pixels }
 * @param {Object} options
 * @param {number} options.margin - automatic side margin in pixels
 * @param {string} options.origin - 'baseline' (default) or 'top'
 * @param {Object[]} options.shapes - shapes on top of the pixels
 * @param {Object|null} options.spacing - { left, right } sidebearings in font units, null for automatic
 * @returns {string}
 */
export function buildSvg(grid, { margin = 0, origin = 'baseline', shapes = [], spacing = null } = {}) {
  const unit = unitsPerPixel(grid.size)
  const offsetRows = origin === 'baseline' ? getMetrics(grid.size).baseline : 0

  const info = effectiveSpacing({ grid, shapes, spacing }, grid.size, margin)
  const offsetX = info ? info.left - info.bounds.left * unit : 0 // Puts the left edge of the glyph at the left sidebearing

  const toX = (px) => Math.round(px * unit + offsetX)
  const toY = (py) => Math.round((py - offsetRows) * unit)

  const parts = traceGrid(grid).map((contour) => contourPath(contour.points.slice().reverse(), toX, toY))
  for (const shape of shapes) parts.push(shapePath(shape, toX, toY))

  const width = info ? info.width : Math.round(margin * 2 * unit)
  const height = grid.size * unit
  const top = -offsetRows * unit

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 ${top} ${width} ${height}">`,
    `  <path fill-rule="nonzero" d="${parts.join(' ')}"/>`,
    '</svg>',
    ''
  ].join('\n')
}

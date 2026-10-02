/**
 * SVG export of one glyph.
 * Pure logic, no DOM dependencies.
 *
 * The grid is the full em box. Contours come from trace.js and are scaled
 * to font units (UPM / grid size per pixel). Each contour is one subpath of
 * a single <path>. Directions are reversed compared to the trace, so outer
 * contours run counter-clockwise and holes clockwise (PostScript direction).
 *
 * origin 'baseline': (0, 0) is on the baseline, y runs downwards, so
 * everything above the baseline has negative y. The viewBox starts at the
 * ascender.
 * origin 'top': (0, 0) is the top left corner of the em box.
 *
 * The viewBox width is the advance width.
 *
 * @version 0.1.0
 */

import { traceGrid } from './trace.js'
import { getMetrics, unitsPerPixel } from '../metrics.js'

/**
 * The rectangle of cells that contain pixels.
 * @param {Object} grid
 * @returns {Object|null} { minX, minY, maxX, maxY } (inclusive), or null if the grid is empty
 */
export function inkBounds(grid) {
  let minX = grid.size
  let minY = grid.size
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      if (!grid.pixels[y * grid.size + x]) continue

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  return maxX < 0 ? null : { minX, minY, maxX, maxY }
}

/**
 * Writes one contour as a path. Corners alternate between horizontal and
 * vertical moves, so H and V commands are enough.
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
 * Builds the SVG file content for a grid.
 * @param {Object} grid - { size, pixels }
 * @param {Object} options
 * @param {number} options.advance - advance width in pixels
 * @param {string} options.origin - 'baseline' (default) or 'top'
 * @returns {string}
 */
export function buildSvg(grid, { advance, origin = 'baseline' }) {
  const unit = unitsPerPixel(grid.size)
  const offsetRows = origin === 'baseline' ? getMetrics(grid.size).baseline : 0

  const toX = (px) => px * unit
  const toY = (py) => (py - offsetRows) * unit

  const d = traceGrid(grid)
    .map((contour) => contourPath(contour.points.slice().reverse(), toX, toY))
    .join(' ')

  const width = advance * unit
  const height = grid.size * unit
  const top = -offsetRows * unit

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 ${top} ${width} ${height}">`,
    `  <path fill-rule="evenodd" d="${d}"/>`,
    '</svg>',
    ''
  ].join('\n')
}

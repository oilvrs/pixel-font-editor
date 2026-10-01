/**
 * Font metrics for the glyph grids.
 * Pure logic, no DOM dependencies.
 *
 * Guide positions are defined in eighths of the em box, counted from the
 * top. Eighths divide evenly into every grid size, so every guide lands
 * exactly on a pixel row boundary and the metrics are identical in font
 * units for all grid sizes.
 *
 * @version 0.1.0
 */

import { SIZES } from './core/grid.js'

export const UPM = 2048

const GUIDES_IN_EIGHTHS = {
  ascender: 0,
  capHeight: 1,
  xHeight: 3,
  baseline: 7,
  descender: 8
}

/**
 * Font units per grid pixel.
 * @param {number} size - 8, 16, 32, 64 or 128
 * @returns {number}
 */
export function unitsPerPixel(size) {
  return UPM / size
}

/**
 * Returns the guide positions for a grid size, as row boundaries counted
 * from the top of the grid (0 = top edge, size = bottom edge).
 * @param {number} size - 8, 16, 32, 64 or 128
 * @returns {Object} { ascender, capHeight, xHeight, baseline, descender }
 */
export function getMetrics(size) {
  if (!SIZES.includes(size)) {
    throw new RangeError(`Unsupported grid size: ${size}. Use one of ${SIZES.join(', ')}.`)
  }

  const rowsPerEighth = size / 8
  const metrics = {}

  for (const [name, eighths] of Object.entries(GUIDES_IN_EIGHTHS)) {
    metrics[name] = eighths * rowsPerEighth
  }

  return metrics
}

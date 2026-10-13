/**
 * The spacing of a glyph in font units: left and right sidebearing and the
 * advance width. Pure logic, no DOM dependencies.
 *
 * A side without a value of its own is automatic: it follows the side
 * margin, which is given in pixels.
 *
 * @version 0.1.0
 */

import { glyphBounds } from './glyph.js'
import { unitsPerPixel } from '../metrics.js'

const isAuto = (value) => value === null || value === undefined

/**
 * The spacing a glyph gets on export and in the text preview.
 * @param {Object} glyph - { grid, shapes, spacing }
 * @param {number} size - grid size
 * @param {number} margin - automatic side margin in pixels
 * @returns {Object|null} { left, right, ink, width, leftIsAuto, rightIsAuto, unit, bounds }, or null if the glyph is empty.
 *   ink is the width of pixels and shapes in font units, unit is font units per pixel, bounds are in cells.
 */
export function effectiveSpacing(glyph, size, margin) {
  const bounds = glyphBounds(glyph)
  if (!bounds) return null

  const unit = unitsPerPixel(size)
  const spacing = glyph.spacing || {}
  const automatic = Math.round(margin * unit)

  const left = isAuto(spacing.left) ? automatic : spacing.left
  const right = isAuto(spacing.right) ? automatic : spacing.right
  const ink = Math.round((bounds.right - bounds.left) * unit)

  return {
    left,
    right,
    ink,
    width: left + ink + right,
    leftIsAuto: isAuto(spacing.left),
    rightIsAuto: isAuto(spacing.right),
    unit,
    bounds
  }
}

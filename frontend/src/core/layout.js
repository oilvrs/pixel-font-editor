/**
 * Text layout for the preview.
 * Pure logic, no DOM dependencies.
 *
 * Every glyph advances by its width on export: left sidebearing, the width
 * of its pixels and shapes, and right sidebearing. A sidebearing that has not
 * been set is the automatic `margin`. There is no kerning.
 *
 * All positions are in grid cells, and can have decimals when a spacing is
 * not a whole number of pixels.
 *
 * @version 0.3.0
 */

import { asGlyph } from './glyph.js'
import { effectiveSpacing } from './spacing.js'

/**
 * Width of a space: a third of the grid.
 * @param {number} size
 * @returns {number}
 */
export function spaceWidth(size) {
  return Math.round(size / 3)
}

/**
 * Width of a glyph that has no drawing: half the grid.
 * @param {number} size
 * @returns {number}
 */
export function missingWidth(size) {
  return Math.round(size / 2)
}

/**
 * Lays out text, line by line.
 * @param {string} text - lines are separated by \n
 * @param {Function} getGlyph - (char) => a glyph { grid, shapes, spacing } or a plain grid, or null if the glyph is not drawn
 * @param {Object} options
 * @param {number} options.size - grid size
 * @param {number} options.margin - automatic side margin in cells
 * @returns {Object} { items, width, height }, where each item is
 *   { char, grid, shapes, x, y, advance, lsb, rsb, inkOffset, missing }.
 *   lsb and rsb are the sidebearings. A glyph is drawn at x + inkOffset, so
 *   inkOffset is the left sidebearing minus the left edge of the glyph in
 *   the grid.
 */
export function layoutText(text, getGlyph, { size, margin }) {
  const lineHeight = size + Math.round(size / 8)
  const lines = String(text).split('\n')
  const items = []
  let width = 0

  lines.forEach((line, row) => {
    const y = row * lineHeight
    let x = 0

    for (const char of line) {
      if (char === '\r') continue

      if (char === ' ') {
        x += spaceWidth(size)
        continue
      }

      const glyph = asGlyph(getGlyph(char))
      const spacing = glyph ? effectiveSpacing(glyph, size, margin) : null

      if (!spacing) {
        const advance = missingWidth(size)
        items.push({ char, grid: null, shapes: [], x, y, advance, lsb: 0, rsb: 0, inkOffset: 0, missing: true })
        x += advance
        continue
      }

      const lsb = spacing.left / spacing.unit
      const rsb = spacing.right / spacing.unit
      const advance = spacing.width / spacing.unit

      items.push({
        char,
        grid: glyph.grid,
        shapes: glyph.shapes,
        x,
        y,
        advance,
        lsb,
        rsb,
        inkOffset: lsb - spacing.bounds.left,
        missing: false
      })
      x += advance
    }

    width = Math.max(width, x)
  })

  return { items, width, height: (lines.length - 1) * lineHeight + size }
}

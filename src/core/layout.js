/**
 * Text layout for the preview.
 * Pure logic, no DOM dependencies.
 *
 * Every glyph advances by the width of its pixels and shapes plus `margin`
 * on both sides, the same as the advance width in the exports, so the
 * preview shows the spacing the font starts with in Glyphs. There is no
 * kerning.
 *
 * All positions are in grid cells.
 *
 * @version 0.2.0
 */

import { asGlyph, glyphBounds } from './glyph.js'

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
 * @param {Function} getGlyph - (char) => a glyph { grid, shapes } or a plain grid, or null if the glyph is not drawn
 * @param {Object} options
 * @param {number} options.size - grid size
 * @param {number} options.margin - side margin in cells
 * @returns {Object} { items, width, height }, where each item is
 *   { char, grid, shapes, x, y, advance, inkOffset, missing }. A glyph is
 *   drawn at x + inkOffset, so inkOffset is margin minus the left edge of
 *   the glyph in the grid.
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
      const bounds = glyph ? glyphBounds(glyph) : null

      if (!bounds) {
        const advance = missingWidth(size)
        items.push({ char, grid: null, shapes: [], x, y, advance, inkOffset: 0, missing: true })
        x += advance
        continue
      }

      const advance = bounds.right - bounds.left + margin * 2
      items.push({
        char,
        grid: glyph.grid,
        shapes: glyph.shapes,
        x,
        y,
        advance,
        inkOffset: margin - bounds.left,
        missing: false
      })
      x += advance
    }

    width = Math.max(width, x)
  })

  return { items, width, height: (lines.length - 1) * lineHeight + size }
}

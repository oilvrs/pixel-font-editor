/**
 * Text layout for the preview.
 * Pure logic, no DOM dependencies.
 *
 * Every glyph advances by its ink width plus `margin` on both sides, the
 * same as the advance width in the SVG export, so the preview shows the
 * spacing the font starts with in Glyphs. There is no kerning.
 *
 * All positions are in grid cells.
 *
 * @version 0.1.0
 */

import { inkBounds } from './export-svg.js'

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
 * @param {Function} getGrid - (char) => grid with pixels, or null if the glyph is not drawn
 * @param {Object} options
 * @param {number} options.size - grid size
 * @param {number} options.margin - side margin in cells
 * @returns {Object} { items, width, height }, where each item is
 *   { char, grid, x, y, advance, inkOffset, missing }. The ink of a glyph
 *   is drawn at x + inkOffset - ink left edge, so inkOffset is margin minus
 *   the left edge of the ink in the grid.
 */
export function layoutText(text, getGrid, { size, margin }) {
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

      const grid = getGrid(char)
      const bounds = grid ? inkBounds(grid) : null

      if (!bounds) {
        const advance = missingWidth(size)
        items.push({ char, grid: null, x, y, advance, inkOffset: 0, missing: true })
        x += advance
        continue
      }

      const advance = bounds.maxX - bounds.minX + 1 + margin * 2
      items.push({ char, grid, x, y, advance, inkOffset: margin - bounds.minX, missing: false })
      x += advance
    }

    width = Math.max(width, x)
  })

  return { items, width, height: (lines.length - 1) * lineHeight + size }
}

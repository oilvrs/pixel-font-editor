/**
 * Layout for the thumbnail of a font: one line of text set in the font's own
 * glyphs. A glyph that is not drawn is set in another font, so it needs the
 * width of that font instead of the half grid that layoutText gives it.
 * Pure logic, no DOM dependencies.
 *
 * @version 0.1.0
 */

import { layoutText } from './layout.js'

/**
 * Lays out one line of text. Glyphs that are not drawn get the width given by
 * measure, and everything after them moves to make room.
 * @param {string} text - one line
 * @param {Function} getGlyph - (char) => a glyph { grid, shapes, spacing }, or null if it is not drawn
 * @param {Object} options
 * @param {number} options.size - grid size
 * @param {number} options.margin - automatic side margin in cells
 * @param {Function} measure - (char) => the width of the char in the other font, in cells
 * @returns {Object} { items, width, height }, as layoutText gives it
 */
export function layoutThumbnail(text, getGlyph, { size, margin }, measure) {
  const layout = layoutText(text, getGlyph, { size, margin })
  let shift = 0

  const items = layout.items.map((item) => {
    const moved = { ...item, x: item.x + shift }

    if (item.missing) {
      const advance = measure(item.char)

      moved.advance = advance
      shift += advance - item.advance
    }

    return moved
  })

  return { items, width: layout.width + shift, height: layout.height }
}

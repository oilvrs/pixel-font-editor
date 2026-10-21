/**
 * Draws the thumbnail of a font on a canvas: "Aa Bb" set in the glyphs the
 * font has, and in Arial for the ones it has not drawn yet.
 *
 * Cells are a whole number of device pixels when there is room, so the pixels
 * stay sharp. A large grid does not fit that way, so it is drawn with one
 * device pixel per cell and scaled down by the browser.
 *
 * @version 0.1.0
 */

import { deserializeGlyph } from '../core/glyph.js'
import { layoutThumbnail } from '../core/thumbnail.js'
import { getMetrics } from '../metrics.js'
import { paintShapes } from './paint-shapes.js'

export const THUMBNAIL_TEXT = 'Aa Bb'

const FALLBACK_FONT = 'Arial, Helvetica, sans-serif'
const MEASURE_PX = 100

/**
 * Restores the glyphs of a project's preview. A damaged glyph is skipped.
 * @param {Object} preview - { char: { size, bits, shapes, spacing } }
 * @returns {Map<string, Object>} char -> { grid, shapes, spacing }
 */
function restoreGlyphs(preview) {
  const glyphs = new Map()

  for (const [char, data] of Object.entries(preview || {})) {
    try {
      glyphs.set(char, deserializeGlyph(data))
    } catch (error) {
      continue // A damaged glyph is drawn in the other font
    }
  }

  return glyphs
}

/**
 * Draws the thumbnail of a project.
 * @param {HTMLCanvasElement} canvas
 * @param {Object} project - { gridSize, margin, preview }
 * @param {Object} options
 * @param {number} options.width - the width the thumbnail should fill, in CSS px
 * @param {string} options.color - the color of the glyphs
 */
export function drawThumbnail(canvas, project, { width, color }) {
  const size = project.gridSize
  const glyphs = restoreGlyphs(project.preview)
  const ctx = canvas.getContext('2d')

  // The width of a letter in the other font, in grid cells. One em is the whole grid.
  ctx.font = `700 ${MEASURE_PX}px ${FALLBACK_FONT}`
  const measure = (char) => (ctx.measureText(char).width / MEASURE_PX) * size

  const layout = layoutThumbnail(
    THUMBNAIL_TEXT,
    (char) => glyphs.get(char) || null,
    { size, margin: project.margin },
    measure
  )

  const dpr = window.devicePixelRatio || 1
  const wanted = width * dpr
  const fit = wanted / layout.width
  const cell = fit >= 1 ? Math.floor(fit) : 1

  canvas.width = Math.max(1, Math.ceil(layout.width * cell))
  canvas.height = Math.max(1, Math.ceil(layout.height * cell))

  // Only shrinks: a thumbnail that is smaller than the room stays at its own size.
  const factor = Math.min(1, wanted / canvas.width)
  canvas.style.width = `${(canvas.width / dpr) * factor}px`
  canvas.style.height = `${(canvas.height / dpr) * factor}px`

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = color

  const baseline = getMetrics(size).baseline * cell

  for (const item of layout.items) {
    if (item.missing) {
      ctx.font = `700 ${size * cell}px ${FALLBACK_FONT}`
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(item.char, Math.round(item.x * cell), Math.round(baseline))
      continue
    }

    const left = Math.round((item.x + item.inkOffset) * cell)
    const { pixels } = item.grid

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (pixels[y * size + x]) ctx.fillRect(left + x * cell, y * cell, cell, cell)
      }
    }

    paintShapes(ctx, item.shapes, { scale: cell, x: left, y: 0 })
  }
}

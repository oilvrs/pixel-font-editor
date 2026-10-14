/**
 * Validation of glyph data sent by the editor.
 * Uses the editor's own core code (frontend/src/core), so the server restores
 * a glyph exactly like the editor does when it reads a backup.
 */

import createError from 'http-errors'
import { ALL_GLYPHS } from '../../../frontend/src/core/glyph-set.js'
import {
  deserializeGlyph,
  glyphIsEmpty,
  serializeGlyph
} from '../../../frontend/src/core/glyph.js'

const ALLOWED_CHARS = new Set(ALL_GLYPHS)

// The number of characters in the glyph set.
export const MAX_GLYPHS = ALL_GLYPHS.length

/**
 * Checks if a value is a character in the glyph set.
 *
 * @param {*} char - The value to check.
 * @returns {boolean} True if it is a character in the glyph set.
 */
export function isAllowedChar (char) {
  return typeof char === 'string' && ALLOWED_CHARS.has(char)
}

/**
 * Throws a 400 error if the value is not a character in the glyph set.
 *
 * @param {*} char - The value to check.
 * @throws {Error} A 400 error.
 */
export function assertAllowedChar (char) {
  if (!isAllowedChar(char)) {
    const shown = JSON.stringify(String(char).slice(0, 10))
    throw createError(400, `${shown} is not a character in the glyph set.`)
  }
}

/**
 * Validates one glyph from a request.
 *
 * Structural errors (wrong size, damaged pixel data) throw a 400 error.
 * Shapes and spacing are cleaned by the editor's own code: invalid shapes
 * are dropped and spacing is rounded, as when a backup is restored.
 *
 * @param {string} char - The character (already checked).
 * @param {*} data - The glyph from the request: { size, bits, shapes?, spacing? }.
 * @param {number} gridSize - The grid size of the project.
 * @returns {{ bits: string, shapes: object[], spacing: object }|null} The data to store,
 *   or null if the glyph is empty.
 * @throws {Error} A 400 error if the glyph is invalid.
 */
export function validateGlyph (char, data, gridSize) {
  const label = `Glyph "${char}"`

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw createError(400, `${label} must be an object.`)
  }

  if (data.size !== gridSize) {
    throw createError(400, `${label} must have size ${gridSize}.`)
  }

  if (typeof data.bits !== 'string') {
    throw createError(400, `${label} must have its pixels in the string "bits".`)
  }

  // 1 bit per cell. All grid sizes are multiples of 8, so there are no spare bits.
  // Re-encoding rejects characters that base64 decoding would silently skip.
  const bytes = Buffer.from(data.bits, 'base64')
  if (bytes.length !== (gridSize * gridSize) / 8 || bytes.toString('base64') !== data.bits) {
    throw createError(400, `${label} has invalid pixel data.`)
  }

  let glyph
  try {
    glyph = deserializeGlyph(data)
  } catch {
    throw createError(400, `${label} has invalid pixel data.`)
  }

  if (glyphIsEmpty(glyph)) {
    return null
  }

  // Serialize again so that what is stored is always in the editor's own format.
  const stored = serializeGlyph(glyph)

  return {
    bits: stored.bits,
    shapes: stored.shapes ?? [],
    spacing: stored.spacing ?? { left: null, right: null }
  }
}

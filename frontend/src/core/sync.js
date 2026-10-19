/**
 * Logic for saving a project to the server: what to send, when to try again,
 * and how unsaved changes kept in the browser relate to the server's version.
 * Pure logic, no DOM dependencies.
 *
 * @version 0.1.0
 */

import { deserializeGlyph, glyphIsEmpty, serializeGlyph } from './glyph.js'

const RETRY_DELAYS = [2000, 5000, 10000, 30000, 60000]

/**
 * How long to wait before the next try after a failed save.
 * @param {number} attempt - 1 for the first failed try, 2 for the second, and so on
 * @returns {number} milliseconds
 */
export function retryDelay(attempt) {
  const index = Math.min(Math.max(attempt, 1), RETRY_DELAYS.length) - 1
  return RETRY_DELAYS[index]
}

/**
 * Makes the batch to send for a set of changed glyphs. A glyph that has a
 * drawing is saved. A glyph that is empty, or missing, is deleted.
 * @param {string[]} chars - the glyphs that have changed
 * @param {Function} getGlyph - (char) => { grid, shapes, spacing } or a falsy value
 * @param {number} baseRevision - the revision of the project the changes are based on
 * @returns {Object} { baseRevision, upserts: { char: glyph }, deletes: [char] }
 */
export function buildBatch(chars, getGlyph, baseRevision) {
  const upserts = {}
  const deletes = []

  for (const char of chars) {
    const glyph = getGlyph(char)

    if (glyph && !glyphIsEmpty(glyph)) upserts[char] = serializeGlyph(glyph)
    else deletes.push(char)
  }

  return { baseRevision, upserts, deletes }
}

/**
 * A glyph from saved data in one fixed form, so that two copies can be
 * compared. An empty or damaged glyph is the same as no glyph.
 * @param {Object|null|undefined} data - { size, bits, shapes?, spacing? }
 * @returns {string|null}
 */
function normalize(data) {
  if (!data) return null

  try {
    const glyph = deserializeGlyph(data)
    return glyphIsEmpty(glyph) ? null : JSON.stringify(serializeGlyph(glyph))
  } catch (error) {
    return null
  }
}

/**
 * Compares unsaved changes kept in the browser with the project on the server.
 *
 * - 'none': nothing is pending
 * - 'drop': the server already has every pending glyph
 * - 'apply': nobody has changed the project since the changes were made
 * - 'conflict': the project has been changed elsewhere, and the glyphs differ
 *
 * @param {Object|null} pending - { baseRevision, maybeRevision, glyphs: { char: glyph|null } }
 * @param {Object} project - { revision, glyphs: { char: glyph } }
 * @returns {string} 'none', 'drop', 'apply' or 'conflict'
 */
export function reconcilePending(pending, project) {
  const chars = pending ? Object.keys(pending.glyphs || {}) : []
  if (chars.length === 0) return 'none'

  const saved = project.glyphs || {}
  const alreadySaved = chars.every(
    (char) => normalize(pending.glyphs[char]) === normalize(saved[char])
  )
  if (alreadySaved) return 'drop'

  // maybeRevision is the revision a save that was under way would have given.
  const revisions = [pending.baseRevision, pending.maybeRevision]
  return revisions.includes(project.revision) ? 'apply' : 'conflict'
}

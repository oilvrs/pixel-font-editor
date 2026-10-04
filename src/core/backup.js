/**
 * Backup of the whole project as a JSON file: every grid size with its
 * glyphs, side margin and font name, plus the preview text.
 * Pure logic, no DOM dependencies. Undo history is not included.
 *
 * @version 0.1.0
 */

import { SIZES, isEmpty, serializeGrid, deserializeGrid } from './grid.js'
import { ALL_GLYPHS } from './glyph-set.js'

export const BACKUP_FORMAT = 'pixel-glyph-editor-backup'

/**
 * Makes the backup object. Empty drawings are left out.
 * @param {Map} sets - size -> { margin, name, glyphs: Map(char -> { grid }) }
 * @param {string} text - the preview text
 * @returns {Object} JSON-friendly object
 */
export function createBackup(sets, text = '') {
  const backup = { format: BACKUP_FORMAT, version: 1, savedAt: new Date().toISOString(), text, sets: {} }

  for (const [size, set] of sets) {
    const glyphs = {}

    for (const [char, record] of set.glyphs) {
      if (!isEmpty(record.grid)) glyphs[char] = serializeGrid(record.grid)
    }

    backup.sets[size] = { margin: set.margin, name: set.name, glyphs }
  }

  return backup
}

/**
 * Reads and checks a backup file. Glyphs that are damaged, have the wrong
 * size or are not part of the glyph set are skipped.
 * @param {string} json - file content
 * @returns {Object} { text, sets: [{ size, margin, name, glyphs: [{ char, grid }] }] }, where margin and name are null when missing
 * @throws {Error} if the file is not a backup from this editor
 */
export function parseBackup(json) {
  let data

  try {
    data = JSON.parse(json)
  } catch (error) {
    throw new Error('the file is not valid JSON')
  }

  if (!data || data.format !== BACKUP_FORMAT) throw new Error('the file is not a backup from this editor')
  if (data.version !== 1) throw new Error('the backup was made by a newer version of the editor')

  const sets = []

  for (const size of SIZES) {
    const saved = data.sets && data.sets[size]
    if (!saved) continue

    const glyphs = []

    for (const char of ALL_GLYPHS) {
      const entry = saved.glyphs && saved.glyphs[char]
      if (!entry || entry.size !== size || typeof entry.bits !== 'string') continue

      try {
        glyphs.push({ char, grid: deserializeGrid(entry) })
      } catch (error) {
        continue // A damaged glyph is skipped
      }
    }

    sets.push({
      size,
      margin: Number.isInteger(saved.margin) ? Math.min(Math.max(saved.margin, 0), Math.floor(size / 4)) : null,
      name: typeof saved.name === 'string' ? saved.name : null,
      glyphs
    })
  }

  return { text: typeof data.text === 'string' ? data.text : '', sets }
}

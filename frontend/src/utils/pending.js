/**
 * Changes that have not been saved to the server yet, kept in localStorage so
 * that they survive a crash, a closed tab or a server that is down. One key
 * per project. The key does not start with glyph-editor:v1:, so clearAll() in
 * storage.js does not remove it.
 *
 * Shape: { baseRevision, maybeRevision, glyphs: { char: glyph|null }, meta: { name?, margin? } }
 * A glyph that is null has been deleted.
 *
 * @version 0.1.0
 */

const PREFIX = 'glyph-editor:pending:'

/**
 * Reads the unsaved changes of a project.
 * @param {string} projectId
 * @returns {Object|null} null if there are none or the data is damaged
 */
export function loadPending(projectId) {
  try {
    const raw = window.localStorage.getItem(PREFIX + projectId)
    if (!raw) return null

    const data = JSON.parse(raw)
    const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

    if (!isObject(data) || !isObject(data.glyphs)) return null

    return {
      baseRevision: data.baseRevision,
      maybeRevision: data.maybeRevision ?? null,
      glyphs: data.glyphs,
      meta: isObject(data.meta) ? data.meta : {},
    }
  } catch (error) {
    return null
  }
}

/**
 * Saves the unsaved changes of a project.
 * @param {string} projectId
 * @param {Object} data
 * @returns {boolean} true if it worked
 */
export function savePending(projectId, data) {
  try {
    window.localStorage.setItem(PREFIX + projectId, JSON.stringify(data))
    return true
  } catch (error) {
    return false
  }
}

/**
 * Removes the unsaved changes of a project.
 * @param {string} projectId
 */
export function clearPending(projectId) {
  try {
    window.localStorage.removeItem(PREFIX + projectId)
  } catch (error) {
    // Nothing to do: nothing can be kept if storage is blocked.
  }
}

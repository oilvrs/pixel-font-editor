/**
 * Undo/redo history based on pixel snapshots.
 * Pure logic, no DOM dependencies. One entry is one whole stroke.
 *
 * A history is { past, future, limit }. Entries are copies of a grid's
 * pixels array.
 *
 * @version 0.1.0
 */

/**
 * Creates an empty history.
 * @param {number} limit - maximum number of undo steps kept
 * @returns {Object}
 */
export function createHistory(limit = 100) {
  return { past: [], future: [], limit }
}

/**
 * Records the state from before a change. Clears the redo stack.
 * @param {Object} history
 * @param {Uint8Array} pixels - the state before the change
 */
export function pushState(history, pixels) {
  history.past.push(pixels.slice())
  if (history.past.length > history.limit) history.past.shift()
  history.future = []
}

/**
 * Steps back one entry.
 * @param {Object} history
 * @param {Uint8Array} current - the current state, kept for redo
 * @returns {Uint8Array|null} the previous state, or null if there is none
 */
export function undoState(history, current) {
  if (history.past.length === 0) return null
  history.future.push(current.slice())
  return history.past.pop()
}

/**
 * Steps forward one entry.
 * @param {Object} history
 * @param {Uint8Array} current - the current state, kept for undo
 * @returns {Uint8Array|null} the next state, or null if there is none
 */
export function redoState(history, current) {
  if (history.future.length === 0) return null
  history.past.push(current.slice())
  return history.future.pop()
}

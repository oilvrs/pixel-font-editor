/**
 * Undo/redo history based on snapshots.
 * Pure logic, no DOM dependencies. One entry is one whole change.
 *
 * A snapshot is either a pixels array (Uint8Array) or an object
 * { pixels, shapes }. Entries are copies, never references.
 *
 * @version 0.2.0
 */

/**
 * Copies a snapshot.
 * @param {Uint8Array|Object} state
 * @returns {Uint8Array|Object}
 */
function copyState(state) {
  if (state && state.pixels) {
    return { pixels: state.pixels.slice(), shapes: (state.shapes || []).map((shape) => ({ ...shape })) }
  }

  return state.slice()
}

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
 * @param {Uint8Array|Object} state - the state before the change
 */
export function pushState(history, state) {
  history.past.push(copyState(state))
  if (history.past.length > history.limit) history.past.shift()
  history.future = []
}

/**
 * Steps back one entry.
 * @param {Object} history
 * @param {Uint8Array|Object} current - the current state, kept for redo
 * @returns {Uint8Array|Object|null} the previous state, or null if there is none
 */
export function undoState(history, current) {
  if (history.past.length === 0) return null
  history.future.push(copyState(current))
  return history.past.pop()
}

/**
 * Steps forward one entry.
 * @param {Object} history
 * @param {Uint8Array|Object} current - the current state, kept for undo
 * @returns {Uint8Array|Object|null} the next state, or null if there is none
 */
export function redoState(history, current) {
  if (history.future.length === 0) return null
  history.past.push(copyState(current))
  return history.future.pop()
}

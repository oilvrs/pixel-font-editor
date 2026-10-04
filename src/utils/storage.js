/**
 * Saving to the browser's localStorage. Every function catches errors
 * (storage blocked or full) and reports them through its return value.
 *
 * Keys: glyph-editor:v1:<size>:<char> for a glyph (a serialized grid),
 * glyph-editor:v1:<size>:margin for the side margin of a grid size, and
 * glyph-editor:v1:text for the preview text.
 *
 * @version 0.1.0
 */

const PREFIX = 'glyph-editor:v1:'

/**
 * Reads a value.
 * @param {string} key
 * @returns {string|null}
 */
function read(key) {
  try {
    return window.localStorage.getItem(PREFIX + key)
  } catch (error) {
    return null
  }
}

/**
 * Writes a value, or removes the key when the value is null.
 * @param {string} key
 * @param {string|null} value
 * @returns {boolean} true if it worked
 */
function write(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key)
    else window.localStorage.setItem(PREFIX + key, value)
    return true
  } catch (error) {
    return false
  }
}

/**
 * Loads a saved glyph.
 * @param {number} size - grid size
 * @param {string} char
 * @returns {Object|null} { size, bits } as made by serializeGrid
 */
export function loadGlyph(size, char) {
  const raw = read(`${size}:${char}`)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch (error) {
    return null
  }
}

/**
 * Saves a glyph, or removes it when data is null (the drawing is empty).
 * @param {number} size
 * @param {string} char
 * @param {Object|null} data - { size, bits }
 * @returns {boolean}
 */
export function saveGlyph(size, char, data) {
  return write(`${size}:${char}`, data ? JSON.stringify(data) : null)
}

/**
 * @param {number} size
 * @returns {number|null} the saved side margin, or null if none is saved
 */
export function loadMargin(size) {
  const raw = read(`${size}:margin`)
  const margin = Number(raw)
  return raw !== null && Number.isInteger(margin) ? margin : null
}

/**
 * @param {number} size
 * @param {number} margin
 * @returns {boolean}
 */
export function saveMargin(size, margin) {
  return write(`${size}:margin`, String(margin))
}

/**
 * @returns {string|null} the saved preview text
 */
export function loadText() {
  return read('text')
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function saveText(text) {
  return write('text', text)
}

/**
 * @param {number} size
 * @returns {string|null} the saved font name of a grid size
 */
export function loadName(size) {
  return read(`${size}:name`)
}

/**
 * @param {number} size
 * @param {string} name
 * @returns {boolean}
 */
export function saveName(size, name) {
  return write(`${size}:name`, name)
}

/**
 * @returns {boolean} whether the glyph sidebar is open, open by default
 */
export function loadPanelOpen() {
  const raw = read('panel-open')
  return raw === null ? true : raw === '1'
}

/**
 * @param {boolean} open
 * @returns {boolean}
 */
export function savePanelOpen(open) {
  return write('panel-open', open ? '1' : '0')
}

/**
 * Removes everything this editor has saved.
 * @returns {boolean} true if it worked
 */
export function clearAll() {
  try {
    const keys = []

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(PREFIX)) keys.push(key)
    }

    keys.forEach((key) => window.localStorage.removeItem(key))
    return true
  } catch (error) {
    return false
  }
}

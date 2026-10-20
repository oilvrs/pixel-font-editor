/**
 * The theme in the browser: reading and changing it, and the colors that
 * canvases need, since they cannot use CSS variables directly.
 *
 * The theme is the data-theme attribute on <html>. The choice is saved in
 * localStorage. The key does not start with glyph-editor:v1:, so clearAll() in
 * storage.js does not remove it. A 'theme-change' event is sent on window.
 *
 * @version 0.1.0
 */

import { nextTheme, resolveTheme } from '../core/theme.js'

const KEY = 'glyph-editor:theme'

let colors = null

/**
 * @returns {string|null} the saved choice
 */
function readStored() {
  try {
    return window.localStorage.getItem(KEY)
  } catch (error) {
    return null
  }
}

/**
 * @param {string} theme
 */
function writeStored(theme) {
  try {
    window.localStorage.setItem(KEY, theme)
  } catch (error) {
    // Nothing to do: the choice is only lost when the page is reloaded.
  }
}

/**
 * Whether animations are allowed. Some people turn them off in the system settings.
 * @returns {boolean}
 */
export function canAnimate() {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * @returns {string} 'light' or 'dark'
 */
export function getTheme() {
  const current = document.documentElement.dataset.theme
  if (current === 'light' || current === 'dark') return current

  return resolveTheme(readStored(), window.matchMedia('(prefers-color-scheme: dark)').matches)
}

/**
 * Puts a theme in place and tells everything that is drawn with JavaScript.
 * @param {string} theme
 */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  colors = null
  window.dispatchEvent(new CustomEvent('theme-change', { detail: { theme } }))
}

/**
 * Changes and saves the theme, with a fade where the browser supports it.
 * @param {string} theme
 */
export function setTheme(theme) {
  if (theme === getTheme()) return

  writeStored(theme)

  if (document.startViewTransition && canAnimate()) {
    const root = document.documentElement
    root.classList.add('theme-transition')

    document
      .startViewTransition(() => applyTheme(theme))
      .finished.catch(() => {})
      .finally(() => root.classList.remove('theme-transition'))
  } else {
    applyTheme(theme)
  }
}

/**
 * Switches between light and dark.
 */
export function toggleTheme() {
  setTheme(nextTheme(getTheme()))
}

/**
 * The colors canvases draw with, read from the CSS variables.
 * @returns {Object} { bg, fg, gridMinor, gridMajor, blueUi, missingBox }
 */
export function palette() {
  if (!colors) {
    const style = window.getComputedStyle(document.documentElement)
    const read = (name) => style.getPropertyValue(name).trim()

    colors = {
      bg: read('--bg'),
      fg: read('--fg'),
      gridMinor: read('--grid-minor'),
      gridMajor: read('--grid-major'),
      blueUi: read('--blue-ui'),
      missingBox: read('--missing-box'),
    }
  }

  return colors
}

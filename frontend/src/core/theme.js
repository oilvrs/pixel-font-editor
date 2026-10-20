/**
 * The two themes and the rule for choosing one. Pure logic, no DOM dependencies.
 * index.html has a copy of the rule that runs before the first paint.
 *
 * @version 0.1.0
 */

export const THEMES = Object.freeze(['light', 'dark'])

/**
 * Chooses the theme: a saved choice wins, otherwise the system setting.
 * @param {string|null|undefined} stored - the saved choice
 * @param {boolean} systemPrefersDark
 * @returns {string} 'light' or 'dark'
 */
export function resolveTheme(stored, systemPrefersDark) {
  if (THEMES.includes(stored)) return stored
  return systemPrefersDark ? 'dark' : 'light'
}

/**
 * The other theme.
 * @param {string} theme
 * @returns {string}
 */
export function nextTheme(theme) {
  return theme === 'dark' ? 'light' : 'dark'
}

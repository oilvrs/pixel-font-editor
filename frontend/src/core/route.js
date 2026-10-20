/**
 * The routes of the app, kept in the hash of the URL so that the app needs
 * no server-side routing. Pure logic, no DOM dependencies.
 *
 *   #/new        make a new font
 *   #/profile    the user's fonts
 *   #/p/<id>     the editor for one project
 *   #/login      log in or create an account
 *
 * @version 0.2.0
 */

const PROJECT_ID = /^[0-9a-f]{24}$/i

/**
 * Reads a route from a URL hash. Anything unknown becomes the new font page.
 * @param {string|null|undefined} hash - for example '#/p/65f0c1d2e3a4b5c6d7e8f901'
 * @returns {Object} { name: 'new' | 'profile' | 'login' } or { name: 'editor', projectId }
 */
export function parseRoute(hash) {
  const path = String(hash || '')
    .replace(/^#\/?/, '')
    .split('?')[0]
    .replace(/\/+$/, '')
  const parts = path.split('/')

  if (parts.length === 1) {
    if (parts[0] === 'login') return { name: 'login' }
    // 'projects' is the old name of the profile page.
    if (parts[0] === 'profile' || parts[0] === 'projects') return { name: 'profile' }
  }

  if (parts.length === 2 && parts[0] === 'p' && PROJECT_ID.test(parts[1])) {
    return { name: 'editor', projectId: parts[1] }
  }

  return { name: 'new' }
}

/**
 * Makes the hash for a route.
 * @param {Object} route - as returned by parseRoute
 * @returns {string}
 */
export function routeToHash(route) {
  if (route.name === 'login') return '#/login'
  if (route.name === 'profile') return '#/profile'
  if (route.name === 'editor') return `#/p/${route.projectId}`
  return '#/new'
}

/**
 * Decides which route to show. Someone who is not logged in only gets the
 * login page, and someone who is logged in does not need it.
 * @param {string} hash - the current URL hash
 * @param {boolean} loggedIn
 * @returns {Object} the route to show
 */
export function resolveRoute(hash, loggedIn) {
  if (!loggedIn) return { name: 'login' }

  const route = parseRoute(hash)
  return route.name === 'login' ? { name: 'new' } : route
}

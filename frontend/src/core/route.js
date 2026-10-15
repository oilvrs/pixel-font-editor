/**
 * The routes of the app, kept in the hash of the URL so that the app needs
 * no server-side routing. Pure logic, no DOM dependencies.
 *
 *   #/login      log in or create an account
 *   #/projects   the user's projects
 *   #/p/<id>     the editor for one project
 *
 * @version 0.1.0
 */

const PROJECT_ID = /^[0-9a-f]{24}$/i

/**
 * Reads a route from a URL hash. Anything unknown becomes the project list.
 * @param {string|null|undefined} hash - for example '#/p/65f0c1d2e3a4b5c6d7e8f901'
 * @returns {Object} { name: 'login' }, { name: 'projects' } or { name: 'editor', projectId }
 */
export function parseRoute(hash) {
  const path = String(hash || '')
    .replace(/^#\/?/, '')
    .split('?')[0]
    .replace(/\/+$/, '')
  const parts = path.split('/')

  if (parts.length === 1 && parts[0] === 'login') return { name: 'login' }

  if (parts.length === 2 && parts[0] === 'p' && PROJECT_ID.test(parts[1])) {
    return { name: 'editor', projectId: parts[1] }
  }

  return { name: 'projects' }
}

/**
 * Makes the hash for a route.
 * @param {Object} route - as returned by parseRoute
 * @returns {string}
 */
export function routeToHash(route) {
  if (route.name === 'login') return '#/login'
  if (route.name === 'editor') return `#/p/${route.projectId}`
  return '#/projects'
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
  return route.name === 'login' ? { name: 'projects' } : route
}

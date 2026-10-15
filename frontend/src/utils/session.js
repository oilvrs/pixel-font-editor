/**
 * The logged in session: the JWT, kept in localStorage so that the user stays
 * logged in when the page is reloaded. The key does not start with
 * glyph-editor:v1:, so clearAll() in storage.js does not log the user out.
 *
 * @version 0.1.0
 */

import { decodeToken, isExpired } from '../core/token.js'

const KEY = 'glyph-editor:session'

/**
 * Saves the token.
 * @param {string} token
 * @returns {boolean} true if it worked
 */
export function saveSession(token) {
  try {
    window.localStorage.setItem(KEY, token)
    return true
  } catch (error) {
    return false
  }
}

/**
 * Removes the session.
 */
export function clearSession() {
  try {
    window.localStorage.removeItem(KEY)
  } catch (error) {
    // Nothing to do: there is no session to remove if storage is blocked.
  }
}

/**
 * Reads the session. A token that is damaged or has expired is removed.
 * @returns {Object|null} { token, id, username, expiresAt }, or null if not logged in
 */
export function getSession() {
  let token = null

  try {
    token = window.localStorage.getItem(KEY)
  } catch (error) {
    return null
  }

  if (!token) return null

  const payload = decodeToken(token)

  if (!payload || isExpired(payload)) {
    clearSession()
    return null
  }

  return { token, id: payload.sub, username: payload.username, expiresAt: payload.exp * 1000 }
}

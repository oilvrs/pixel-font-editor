/**
 * Reading the payload of a JWT. The token is only decoded here, not verified:
 * the server verifies it on every request. The payload is used to show the
 * username and to know when the session has expired.
 * Pure logic, no DOM dependencies.
 *
 * @version 0.1.0
 */

/**
 * Decodes the payload of a JWT. A JWT uses base64url and UTF-8, which atob
 * alone does not handle.
 * @param {string} token
 * @returns {Object|null} the payload, or null if the token is malformed or has no subject
 */
export function decodeToken(token) {
  try {
    const part = token.split('.')[1]
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes))

    return payload && typeof payload.sub === 'string' ? payload : null
  } catch (error) {
    return null
  }
}

/**
 * Checks if a token has expired. A token without an expiry time counts as expired.
 * @param {Object} payload - as returned by decodeToken
 * @param {number} [now] - the current time in milliseconds
 * @returns {boolean}
 */
export function isExpired(payload, now = Date.now()) {
  return typeof payload.exp !== 'number' || payload.exp * 1000 <= now
}

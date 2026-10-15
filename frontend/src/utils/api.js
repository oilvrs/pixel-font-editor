/**
 * All communication with the backend. One exported function per endpoint,
 * and the token is added to every request that is not a login or a
 * registration. Every function throws an ApiError when the request fails.
 *
 * If the server answers 401 to a request that carried a token, the session
 * has expired: it is removed and a 'session-expired' event is sent on window.
 *
 * @version 0.1.0
 */

import { API_URL } from '../config.js'
import { clearSession, getSession } from './session.js'

// The free hosting plan puts the server to sleep, and waking it takes a while.
const TIMEOUT_MS = 60000

/**
 * An error from a request. status is 0 if the server could not be reached.
 */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   */
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Sends a request and reads the JSON answer.
 * @param {string} method
 * @param {string} path - after the API address, for example '/projects'
 * @param {Object} [options]
 * @param {*} [options.body] - sent as JSON
 * @param {boolean} [options.auth] - false for requests that must not send the token
 * @param {boolean} [options.keepalive] - lets the request finish when the page is closed
 * @returns {Promise<*>} the JSON answer, or null if there is none
 * @throws {ApiError}
 */
async function request(method, path, { body, auth = true, keepalive = false } = {}) {
  const session = auth ? getSession() : null
  const headers = {}

  if (session) headers.Authorization = `Bearer ${session.token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    const message =
      error.name === 'TimeoutError'
        ? 'The server did not answer in time.'
        : 'Could not reach the server.'
    throw new ApiError(message, 0)
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && session) {
      clearSession()
      window.dispatchEvent(new CustomEvent('session-expired'))
    }

    throw new ApiError(
      (data && data.message) || `The server answered ${response.status}.`,
      response.status
    )
  }

  return data
}

// ── AUTH ──────────────────────────────────────────────────────────────────

/**
 * Creates an account. The server's error messages are replaced, because in
 * production the server gives the same text for every 400 error.
 * @param {string} username - 3 to 30 characters
 * @param {string} password - 10 to 72 characters
 * @returns {Promise<{id: string}>}
 * @throws {ApiError}
 */
export async function register(username, password) {
  try {
    return await request('POST', '/auth/register', { body: { username, password }, auth: false })
  } catch (error) {
    if (error.status === 409) error.message = 'That username is already taken.'
    if (error.status === 400) {
      error.message =
        'The username must be 3 to 30 characters and the password 10 to 72 characters.'
    }
    throw error
  }
}

/**
 * Logs in.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<string>} the access token
 * @throws {ApiError}
 */
export async function login(username, password) {
  try {
    const data = await request('POST', '/auth/login', { body: { username, password }, auth: false })
    return data['access-token']
  } catch (error) {
    // In production the server gives a token error for every 401.
    if (error.status === 401) error.message = 'Wrong username or password.'
    throw error
  }
}

// ── PROJECTS ──────────────────────────────────────────────────────────────

/**
 * @returns {Promise<Object[]>} the user's projects, without glyphs
 */
export function getProjects() {
  return request('GET', '/projects')
}

/**
 * @param {Object} data - { name, gridSize, margin?, previewText? }
 * @returns {Promise<Object>} the new project
 */
export function createProject(data) {
  return request('POST', '/projects', { body: data })
}

/**
 * @param {string} id
 * @returns {Promise<Object>} the project with all its glyphs, keyed by character
 */
export function getProject(id) {
  return request('GET', `/projects/${id}`)
}

/**
 * @param {string} id
 * @param {Object} patch - any of { name, margin, previewText }
 * @returns {Promise<Object>} the updated project
 */
export function updateProject(id, patch) {
  return request('PATCH', `/projects/${id}`, { body: patch })
}

/**
 * @param {string} id
 * @returns {Promise<null>}
 */
export function deleteProject(id) {
  return request('DELETE', `/projects/${id}`)
}

/**
 * Saves and deletes glyphs in one batch. Fails with status 409 if the project
 * has been changed elsewhere since baseRevision.
 * @param {string} id
 * @param {Object} batch - { baseRevision, upserts: { char: glyph }, deletes: [char] }
 * @param {Object} [options] - { keepalive }
 * @returns {Promise<{revision: number, glyphCount: number, updatedAt: string}>}
 */
export function saveGlyphs(id, batch, { keepalive = false } = {}) {
  return request('PUT', `/projects/${id}/glyphs`, { body: batch, keepalive })
}

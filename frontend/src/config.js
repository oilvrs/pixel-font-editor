/**
 * Where the backend is. Chosen by the host the page is served from, since the
 * project has no build step and therefore no environment variables.
 * An address on the local network counts as local, so that the app can be
 * tried on a phone while the backend runs on this computer.
 *
 * @version 0.2.0
 */

const LOCAL_HOST =
  /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/

// Set this to the address of the deployed backend (step 9).
const PRODUCTION_API_URL = 'https://glyph-editor-backend.onrender.com/api/v1'

const { hostname } = window.location

export const API_URL = LOCAL_HOST.test(hostname)
  ? `http://${hostname}:3004/api/v1`
  : PRODUCTION_API_URL

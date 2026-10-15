/**
 * Where the backend is. Chosen by the host the page is served from, since the
 * project has no build step and therefore no environment variables.
 *
 * @version 0.1.0
 */

const LOCAL_HOSTS = ['localhost', '127.0.0.1']
const LOCAL_API_URL = 'http://localhost:3004/api/v1'

// Set this to the address of the deployed backend (step 9).
const PRODUCTION_API_URL = 'https://glyph-editor-backend.onrender.com/api/v1'

export const API_URL = LOCAL_HOSTS.includes(window.location.hostname)
  ? LOCAL_API_URL
  : PRODUCTION_API_URL

/**
 * Creates the application for tests, with high rate limits by default.
 */

import "./silentLogger.js";
import { createApp } from "../../src/app.js";

/**
 * Creates the application.
 *
 * @param {object} [options] - Options passed on to createApp.
 * @returns {import('express').Express} The application.
 */
export function createTestApp(options = {}) {
  return createApp({
    generalLimit: 10000,
    authLimit: 10000,
    projectLimit: 10000,
    ...options,
  });
}

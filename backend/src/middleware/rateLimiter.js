/**
 * Rate limiting middleware to prevent abuse of API endpoints.
 * Two limiters are created - a general one for all routes and a strict one
 * for the auth endpoints to limit brute force attacks. They are factories so
 * that tests can use other limits than production.
 */

import rateLimit from 'express-rate-limit'

/**
 * Creates the general limiter, applied to all routes.
 *
 * @param {number} [max] - Requests per 15 minutes and IP address.
 * @returns {Function} Express middleware.
 */
export function createGeneralLimiter (max = 100) {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes.
    max,
    standardHeaders: true, // Return rate limit info in RateLimit-* headers.
    legacyHeaders: false, // Disable X-RateLimit-* headers.
    /**
     * Health checks (uptime pings) are not counted.
    */
    skip: (req) => req.path === '/health',
    message: {
      status_code: 429,
      message: 'Too many requests, please try again later.'
    }
  })
}

/**
 * Creates the strict limiter, applied only to the authentication endpoints.
 *
 * @param {number} [max] - Requests per 15 minutes and IP address.
 * @returns {Function} Express middleware.
 */
export function createAuthLimiter (max = 10) {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes.
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status_code: 429,
      message: 'Too many authentication attempts, please try again later.'
    }
  })
}

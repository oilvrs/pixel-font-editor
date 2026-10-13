/**
 * Defines a centralised error-handler.
 *
 * @author Mattias Mellin
 * @version 1.0.0
 */

import http from 'node:http'
import { logger } from '../config/winston.js'

/**
 * Creates a centralised Express error-handling middleware.
 *
 * @param {object} options - Configuration options.
 * @param {string} options.environment - Current application environment.
 * @returns {import('express').ErrorRequestHandler} Express error-handling middleware.
 */
export function errorHandler ({ environment }) {
  return (err, req, res, next) => {
    // Convert Mongoose validation errors to 400
    if (err.name === 'ValidationError') {
      err.status = 400
    }

    const status = err.status || 500

    logger.error(err.message, {
      metadata: {
        status,
        stack: err.stack,
        path: req.originalUrl,
        method: req.method
      }
    })

    // Production
    if (environment === 'production') {
      if (!err.status) {
        err.status = 500
        err.message = 'An unexpected condition was encountered'
      }

      if (err.status === 400) {
        err.message = 'The request cannot or will not be processed due to something that is perceived to be a client error (for example validation error).'
      }

      if (err.status === 401) {
        err.message = 'Access token invalid or not provided.'
      }

      if (err.status === 403) {
        err.message = 'The request contained valid data and was understood by the server, but the server is refusing action due to the authenticated user not having the necessary permissions for the resource.'
      }

      if (err.status === 404) {
        err.message = 'The requested resource was not found.'
      }

      return res.status(status).json({
        status_code: status,
        message: err.message
      })
    }

    // Development
    return res.status(status).json({
      status_code: status,
      error: http.STATUS_CODES[status],
      message: err.message,
      stack: err.stack
    })
  }
}

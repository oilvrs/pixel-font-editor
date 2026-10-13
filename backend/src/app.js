/**
 * Defines the Express application with middleware, routes and error handling.
 * Does not connect to the database or listen on a port, so that tests can
 * import it. See server.js for startup.
 */

import httpContext from 'express-http-context'
import '@lnu/json-js-cycle'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { randomUUID } from 'node:crypto'
import { morganLogger } from './config/morgan.js'
import { errorHandler } from './config/errorhandler.js'
import { createAuthLimiter, createGeneralLimiter } from './middleware/rateLimiter.js'
import { router } from './routes/router.js'

/**
 * Creates the Express application.
 *
 * @param {object} [options] - Options, mainly for tests.
 * @param {number} [options.generalLimit] - Requests per 15 minutes and IP, all routes.
 * @param {number} [options.authLimit] - Requests per 15 minutes and IP, auth routes.
 * @returns {import('express').Express} The application.
 */
export function createApp ({ generalLimit = 100, authLimit = 10 } = {}) {
  const { NODE_ENV, CORS_ORIGIN } = process.env

  const app = express()

  // Render runs behind one proxy. Without this all clients share one IP address,
  // and therefore one rate limit.
  if (NODE_ENV === 'production') {
    app.set('trust proxy', 1)
  }

  // Set various HTTP headers to make the application more secure.
  app.use(helmet())

  // Limit requests to prevent overwhelming.
  app.use(createGeneralLimiter(generalLimit))

  // Enable Cross Origin Resource Sharing (CORS).
  app.use(cors({ origin: CORS_ORIGIN }))

  // Parse requests of the content type application/json.
  // The limit is raised for saving many glyphs at once (step 2).
  app.use(express.json({ limit: '2mb' }))

  // Add the request-scoped context - placed before any middleware that needs access to context.
  app.use(httpContext.middleware)

  // Use a morgan logger.
  app.use(morganLogger)

  // Middleware to be executed before the routes.
  app.use((req, res, next) => {
    // Add a request UUID to each request and store information about
    // each request in the request-scoped context.
    req.requestUuid = randomUUID()
    httpContext.set('request', req)
    next()
  })

  // Strict limit on register and login.
  app.use('/api/v1/auth', createAuthLimiter(authLimit))

  // Register routes.
  app.use('/', router)

  // Error handler.
  app.use(errorHandler({ environment: NODE_ENV }))

  return app
}

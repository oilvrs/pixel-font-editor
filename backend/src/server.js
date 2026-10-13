/**
 * Starts the application: connects to MongoDB and listens for connections.
 */

import { createApp } from './app.js'
import { connectToDatabase } from './config/mongoose.js'
import { logger } from './config/winston.js'

try {
  const { PORT, DB_CONNECTION_STRING } = process.env

  // Connect to MongoDB.
  await connectToDatabase(DB_CONNECTION_STRING)

  const app = createApp()

  // Starts the HTTP server listening for connections.
  const server = app.listen(PORT, () => {
    logger.info(`Server running at http://localhost:${server.address().port}`)
    logger.info('Press Ctrl-C to terminate...')
  })
} catch (err) {
  logger.error(err.message, { error: err })
  process.exitCode = 1
}

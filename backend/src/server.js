/**
 * Starts the application: connects to MongoDB and listens for connections.
 */

import { createApp } from "./app.js";
import { connectToDatabase } from "./config/mongoose.js";
import { logger } from "./config/winston.js";

try {
  const { PORT, NODE_ENV, DB_CONNECTION_STRING } = process.env;

  // A server that starts in production without its settings would run with unsafe defaults.
  if (NODE_ENV === "production") {
    const required = [
      "DB_CONNECTION_STRING",
      "CORS_ORIGIN",
      "ACCESS_TOKEN_SECRET",
      "ACCESS_TOKEN_PUBLIC",
      "ACCESS_TOKEN_LIFE",
    ];

    for (const name of required) {
      if (!process.env[name]) {
        throw new Error(`${name} must be set in production.`);
      }
    }
  }

  // Connect to MongoDB.
  await connectToDatabase(DB_CONNECTION_STRING);

  const app = createApp();

  // Starts the HTTP server listening for connections.
  const server = app.listen(PORT, () => {
    logger.info(`Server running at http://localhost:${server.address().port}`);
    logger.info("Press Ctrl-C to terminate...");
  });
} catch (err) {
  logger.error(err.message, { error: err });
  process.exitCode = 1;
}

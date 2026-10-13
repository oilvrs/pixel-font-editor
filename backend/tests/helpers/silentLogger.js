/**
 * Silences the Winston logger. Import for the side effect.
 */

import { logger } from '../../src/config/winston.js'

logger.silent = true

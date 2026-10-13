/**
 * Defines the main router.
 */

import express from 'express'
import createError from 'http-errors'
import { router as v1Router } from './api/v1/router.js'

export const router = express.Router()

// Used by Render and uptime checks.
router.get('/health', (req, res) => res.json({ status: 'ok' }))

router.use('/api/v1', v1Router)

// Catch requests to routes that do not exist.
router.use((req, res, next) => next(createError(404)))

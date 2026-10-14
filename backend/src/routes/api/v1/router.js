/**
 * Defines the API version 1 router.
 * Collects and mounts all v1 sub-routers under their respective paths.
 */

import express from 'express'
import { router as authRouter } from './authRouter.js'
import { router as projectRouter } from './projectRouter.js'

export const router = express.Router()

router.use('/auth', authRouter)
router.use('/projects', projectRouter)

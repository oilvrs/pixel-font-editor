/**
 * Defines the API version 1 router.
 * Collects and mounts all v1 sub-routers under their respective paths.
 */

import express from 'express'
import { router as authRouter } from './authRouter.js'

export const router = express.Router()

router.use('/auth', authRouter)

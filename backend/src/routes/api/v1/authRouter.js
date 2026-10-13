/**
 * Defines the auth router.
 * The rate limiter for these routes is mounted in app.js.
 */

import express from 'express'
import { AuthController } from '../../../controllers/api/AuthController.js'

export const router = express.Router()

const controller = new AuthController()

// POST /register
router.post('/register', (req, res, next) => controller.register(req, res, next))

// POST /login
router.post('/login', (req, res, next) => controller.login(req, res, next))

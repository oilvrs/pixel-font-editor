/**
 * Defines the project router.
 * All project routes require a valid JWT, since every project is private.
 */

import express from 'express'
import { ProjectController } from '../../../controllers/api/ProjectController.js'
import { authenticateJWT } from '../../../middleware/auth.js'

export const router = express.Router()

const controller = new ProjectController()

// All routes require a valid JWT. Must come before router.param so that
// req.user is available when the project is loaded.
router.use(authenticateJWT)

// Load the project (and check ownership) for any route containing :id.
router.param('id', (req, res, next, id) => controller.loadProjectDocument(req, res, next, id))

// GET /api/v1/projects - the authenticated user's projects.
router.get('/', (req, res, next) => controller.findAll(req, res, next))

// POST /api/v1/projects - create a project.
router.post('/', (req, res, next) => controller.create(req, res, next))

// GET /api/v1/projects/:id - one project with its glyphs.
router.get('/:id', (req, res, next) => controller.find(req, res, next))

// PATCH /api/v1/projects/:id - update name, margin and preview text.
router.patch('/:id', (req, res, next) => controller.update(req, res, next))

// DELETE /api/v1/projects/:id - delete a project and its glyphs.
router.delete('/:id', (req, res, next) => controller.delete(req, res, next))

/**
 * Defines the GlyphController class.
 * Saves the glyphs of a project in batches, with a revision check so that
 * two devices do not silently overwrite each other.
 */

import createError from 'http-errors'
import mongoose from 'mongoose'
import { GlyphModel } from '../../models/GlyphModel.js'
import { ProjectModel } from '../../models/ProjectModel.js'
import {
  MAX_GLYPHS,
  assertAllowedChar,
  validateGlyph
} from '../../validation/glyphValidation.js'

/**
 * Reads and validates a batch from a request body. Nothing is saved here.
 *
 * @param {object} body - The request body.
 * @param {number} gridSize - The grid size of the project.
 * @returns {{ baseRevision: number, toWrite: object[], removals: string[] }} The batch.
 *   Empty glyphs are returned as removals.
 * @throws {Error} A 400 error if the batch is invalid.
 */
function parseBatch (body, gridSize) {
  const { baseRevision, upserts = {}, deletes = [] } = body ?? {}

  if (!Number.isInteger(baseRevision) || baseRevision < 0) {
    throw createError(400, 'baseRevision must be a non-negative integer.')
  }

  if (upserts === null || typeof upserts !== 'object' || Array.isArray(upserts)) {
    throw createError(400, 'upserts must be an object with one entry per character.')
  }

  if (!Array.isArray(deletes)) {
    throw createError(400, 'deletes must be an array of characters.')
  }

  const upsertChars = Object.keys(upserts)
  const total = upsertChars.length + deletes.length

  if (total === 0) {
    throw createError(400, 'There is nothing to save.')
  }

  if (total > MAX_GLYPHS) {
    throw createError(400, `At most ${MAX_GLYPHS} glyphs can be changed at once.`)
  }

  const removals = new Set()
  for (const char of deletes) {
    assertAllowedChar(char)
    removals.add(char)
  }

  const toWrite = []
  for (const char of upsertChars) {
    assertAllowedChar(char)

    if (removals.has(char)) {
      throw createError(400, `Glyph "${char}" cannot be both saved and deleted.`)
    }

    const data = validateGlyph(char, upserts[char], gridSize)

    if (data === null) {
      // An empty glyph is not stored. The editor does the same.
      removals.add(char)
    } else {
      toWrite.push({ char, ...data })
    }
  }

  return { baseRevision, toWrite, removals: [...removals] }
}

/**
 * Encapsulates the glyph controller.
 */
export class GlyphController {
  /**
   * PUT /api/v1/projects/:id/glyphs
   * Saves and deletes glyphs in one transaction. The batch is only applied
   * if baseRevision is the project's current revision, otherwise 409.
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {Function} next - Express next middleware function.
   */
  async save (req, res, next) {
    try {
      const project = req.doc
      const { baseRevision, toWrite, removals } = parseBatch(req.body, project.gridSize)

      let updated

      await mongoose.connection.transaction(async (session) => {
        // Compare and increase the revision in one step. If another save got there
        // first, nothing matches. A write conflict between two simultaneous saves
        // makes the transaction run again, and the second run finds no match.
        const claimed = await ProjectModel.updateOne(
          { _id: project._id, revision: baseRevision },
          { $inc: { revision: 1 }, $set: { updatedAt: new Date() } },
          { session }
        )

        if (claimed.matchedCount === 0) {
          throw createError(409, 'The project has been changed elsewhere. Reload it before saving.')
        }

        const operations = toWrite.map(({ char, bits, shapes, spacing }) => ({
          updateOne: {
            filter: { project: project._id, char },
            update: { $set: { bits, shapes, spacing } },
            upsert: true
          }
        }))

        if (removals.length > 0) {
          operations.push({
            deleteMany: { filter: { project: project._id, char: { $in: removals } } }
          })
        }

        await GlyphModel.bulkWrite(operations, { session })

        const glyphCount = await GlyphModel
          .countDocuments({ project: project._id })
          .session(session)

        updated = await ProjectModel.findOneAndUpdate(
          { _id: project._id },
          { $set: { glyphCount } },
          { session, new: true }
        )
      })

      res.json({
        revision: updated.revision,
        glyphCount: updated.glyphCount,
        updatedAt: updated.updatedAt
      })
    } catch (error) {
      next(error)
    }
  }
}

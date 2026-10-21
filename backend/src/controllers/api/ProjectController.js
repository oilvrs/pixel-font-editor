/**
 * Defines the ProjectController class.
 * Handles CRUD for projects. Every project belongs to one user and is
 * only visible to that user.
 */

import createError from "http-errors";
import mongoose from "mongoose";
import { GlyphModel } from "../../models/GlyphModel.js";
import { ProjectModel } from "../../models/ProjectModel.js";

const MAX_PROJECTS_PER_USER = 50;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

// The glyphs the thumbnails on the profile page are set in: "Aa Bb".
const PREVIEW_CHARS = ["A", "a", "B", "b"];

/**
 * A glyph in the shape the editor stores: { size, bits, shapes, spacing }.
 *
 * @param {object} glyph - A glyph document or a lean glyph.
 * @param {number} size - The grid size of the project.
 * @returns {object} The glyph data.
 */
function toGlyphData(glyph, size) {
  return {
    size,
    bits: glyph.bits,
    shapes: glyph.shapes,
    spacing: glyph.spacing,
  };
}

/**
 * Returns the automatic margin in pixels for a grid size.
 * Same rule as defaultMargin in the frontend (metrics.js).
 *
 * @param {*} gridSize - The grid size from the request.
 * @returns {number|undefined} The margin, or undefined if the grid size is not a number.
 */
function defaultMargin(gridSize) {
  const size = Number(gridSize);
  return Number.isFinite(size) ? Math.max(1, size / 16) : undefined;
}

/**
 * Encapsulates the project controller.
 */
export class ProjectController {
  /**
   * Loads a project by ID and attaches it to req.doc.
   * Only projects owned by the authenticated user are found, so someone
   * else's project gives the same 404 as a project that does not exist.
   * Used via router.param('id', ...).
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {Function} next - Express next middleware function.
   * @param {string} id - The project ID from the URL parameter.
   */
  async loadProjectDocument(req, res, next, id) {
    try {
      // A malformed id is treated as a missing project instead of a Mongoose CastError.
      const project = OBJECT_ID.test(id)
        ? await ProjectModel.findOne({ _id: id, owner: req.user.id })
        : null;

      if (!project) {
        throw createError(404, "The requested resource was not found.");
      }

      req.doc = project;
      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/projects
   * Returns the authenticated user's projects, without glyph data except the
   * few glyphs the thumbnails are set in (see PREVIEW_CHARS).
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {Function} next - Express next middleware function.
   */
  async findAll(req, res, next) {
    try {
      const projects = await ProjectModel.find({ owner: req.user.id })
        .sort({ updatedAt: -1 })
        .select("name gridSize margin glyphCount revision createdAt updatedAt");

      const previews = new Map(projects.map((project) => [project.id, {}]));

      // One query for the glyphs of all projects.
      if (projects.length > 0) {
        const sizes = new Map(
          projects.map((project) => [project.id, project.gridSize]),
        );
        const glyphs = await GlyphModel.find({
          project: { $in: projects.map((project) => project._id) },
          char: { $in: PREVIEW_CHARS },
        })
          .select("project char bits shapes spacing")
          .lean();

        for (const glyph of glyphs) {
          const id = String(glyph.project);
          previews.get(id)[glyph.char] = toGlyphData(glyph, sizes.get(id));
        }
      }

      res.json(
        projects.map((project) => ({
          ...project.toJSON(),
          preview: previews.get(project.id),
        })),
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/projects/:id
   * Returns a project with all its glyphs, keyed by character.
   * Each glyph has the shape the editor stores: { size, bits, shapes, spacing }.
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {Function} next - Express next middleware function.
   */
  async find(req, res, next) {
    try {
      const project = req.doc;

      const documents = await GlyphModel.find({ project: project._id })
        .select("char bits shapes spacing")
        .lean();

      const glyphs = {};
      for (const glyph of documents) {
        glyphs[glyph.char] = toGlyphData(glyph, project.gridSize);
      }

      res.json({ ...project.toJSON(), glyphs });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/projects
   * Creates a project owned by the authenticated user.
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {Function} next - Express next middleware function.
   */
  async create(req, res, next) {
    try {
      const { name, gridSize, margin, previewText } = req.body;

      const count = await ProjectModel.countDocuments({ owner: req.user.id });

      if (count >= MAX_PROJECTS_PER_USER) {
        throw createError(
          403,
          `You can have at most ${MAX_PROJECTS_PER_USER} projects.`,
        );
      }

      const project = await ProjectModel.create({
        owner: req.user.id,
        name,
        gridSize,
        margin: margin ?? defaultMargin(gridSize),
        previewText,
      });

      const locationUrl = new URL(
        `${req.protocol}://${req.get("host")}${req.baseUrl}/${project.id}`,
      );

      res.location(locationUrl.href).status(201).json(project);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/projects/:id
   * Updates the name, margin and preview text. Other fields are ignored.
   * The glyphs are saved with PUT /projects/:id/glyphs.
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {Function} next - Express next middleware function.
   */
  async update(req, res, next) {
    try {
      const project = req.doc;
      const { name, margin, previewText } = req.body;

      // Only update fields that are provided.
      if (name !== undefined) project.name = name;
      if (margin !== undefined) project.margin = margin;
      if (previewText !== undefined) project.previewText = previewText;

      await project.save();

      res.status(200).json(project);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/projects/:id
   * Deletes a project and all its glyphs, in one transaction.
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {Function} next - Express next middleware function.
   */
  async delete(req, res, next) {
    try {
      await mongoose.connection.transaction(async (session) => {
        await GlyphModel.deleteMany({ project: req.doc._id }, { session });
        await req.doc.deleteOne({ session });
      });

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }
}

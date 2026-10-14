/**
 * Defines the project model.
 * A project is one pixel font on one grid size. The glyphs are stored
 * in their own collection (see GlyphModel).
 */

import mongoose from 'mongoose'
import { BASE_SCHEMA } from './baseSchema.js'

const schema = new mongoose.Schema({
  // The owning user - only the owner may see or change the project.
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60
  },
  // The grid size is fixed for the whole project.
  gridSize: {
    type: Number,
    required: true,
    enum: [8, 16, 32, 64, 128],
    immutable: true
  },
  // Automatic side margin in pixels.
  margin: {
    type: Number,
    required: true,
    min: 0,
    max: 128
  },
  previewText: {
    type: String,
    default: '',
    maxlength: 500
  },
  // Increased on every change to the glyphs. Used to detect conflicts between devices.
  revision: {
    type: Number,
    default: 0,
    min: 0
  },
  // Number of drawn glyphs, kept in sync when glyphs are saved.
  glyphCount: {
    type: Number,
    default: 0,
    min: 0
  },
  schemaVersion: {
    type: Number,
    default: 1
  }
})

schema.add(BASE_SCHEMA)

export const ProjectModel = mongoose.model('Project', schema)

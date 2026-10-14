/**
 * Defines the glyph model.
 * One document per drawn character in a project. The grid size is not stored
 * here, it is always the grid size of the project.
 */

import mongoose from 'mongoose'
import { BASE_SCHEMA } from './baseSchema.js'

const schema = new mongoose.Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  char: {
    type: String,
    required: true,
    minlength: 1,
    maxlength: 2
  },
  // The pixels, 1 bit per cell, base64 encoded.
  bits: {
    type: String,
    required: true
  },
  // Vector shapes on top of the pixels. Their structure is owned by the editor.
  shapes: [{ type: mongoose.Schema.Types.Mixed }],
  // Side bearings in font units. null means automatic.
  spacing: {
    left: { type: Number, default: null },
    right: { type: Number, default: null }
  }
})

// One document per character and project.
schema.index({ project: 1, char: 1 }, { unique: true })

schema.add(BASE_SCHEMA)

export const GlyphModel = mongoose.model('Glyph', schema)

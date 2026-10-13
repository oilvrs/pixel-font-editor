/**
 * @file Defines the base schema - Taken directly from example code.
 * @module baseSchema
 * @author Mats Loock
 */

import mongoose from 'mongoose'

// Options to use converting the document to a plain object and JSON.
const convertOptions = {
  getters: true, // Include getters and virtual properties.
  versionKey: false, // Exclude the __v property.
  /**
   * Transforms the document, removing the _id property.
   *
   * @param {object} doc - The mongoose document which is being converted.
   * @param {object} ret - The plain object representation which has been converted.
   * @returns {object} The transformed object.
   * @see https://mongoosejs.com/docs/api.html#document_Document-toObject
   */
  transform: (doc, ret) => {
    // Remove _id from response, id getter provides it instead.
    delete ret._id
    return ret
  }
}

const baseSchema = new mongoose.Schema({}, {
  timestamps: true,
  toObject: convertOptions,
  toJSON: convertOptions,
  optimisticConcurrency: false
})

export const BASE_SCHEMA = Object.freeze(baseSchema)

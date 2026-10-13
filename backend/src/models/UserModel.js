/**
 * Defines the user model.
 */

import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { BASE_SCHEMA } from './baseSchema.js'

const schema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  password: {
    type: String,
    required: true,
    minlength: 10,
    // bcrypt only uses the first 72 bytes of the password.
    maxlength: 72
  }
})

// Override toJSON to inherit base transformations but also strip the password field.
schema.set('toJSON', {
  ...BASE_SCHEMA.get('toJSON'),
  /**
   * Transforms the document, removing the password field.
   *
   * @param {object} doc - The mongoose document which is being converted.
   * @param {object} ret - The plain object representation which has been converted.
   */
  transform: (doc, ret) => {
    // Run the base transformation first (removes _id, adds id, etc.).
    BASE_SCHEMA.get('toJSON').transform(doc, ret)
    // Never expose the hashed password in API responses.
    delete ret.password
  }
})

// Merge base schema fields (id, createdAt, updatedAt) into this schema.
schema.add(BASE_SCHEMA)

// Mongoose middleware - runs automatically before every save().
schema.pre('save', async function () {
  // Only hash the password if it has been changed (avoids double-hashing).
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10)
  }
})

/**
 * Authenticates a user by username and password.
 *
 * @param {string} username - The username.
 * @param {string} password - The password.
 * @returns {Promise<UserModel>} Resolves to the user if authentication succeeded.
 */
schema.statics.authenticate = async function (username, password) {
  const user = await this.findOne({ username })

  // Check both in one condition to avoid revealing whether the username
  // or the password was wrong.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    const error = new Error('Invalid credentials.')
    error.status = 401
    throw error
  }

  return user
}

export const UserModel = mongoose.model('User', schema)

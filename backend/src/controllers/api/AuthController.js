/**
 * Defines the AuthController class.
 * Handles all logic for the endpoints POST /register and POST /login.
 */

import createError from 'http-errors'
import jwt from 'jsonwebtoken'
import { UserModel } from '../../models/UserModel.js'

/**
 * Makes sure the credentials are strings, so that objects such as
 * { "$ne": null } never reach a database query.
 *
 * @param {*} username - The username from the request body.
 * @param {*} password - The password from the request body.
 * @throws {Error} A 400 error if either value is not a string.
 */
function assertStrings (username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw createError(400, 'Username and password must be strings.')
  }
}

/**
 * Encapsulates the auth controller.
 */
export class AuthController {
  /**
   * Registers a new user account.
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {Function} next - Express next middleware function.
   */
  async register (req, res, next) {
    try {
      const { username, password } = req.body

      assertStrings(username, password)

      const user = await UserModel.create({ username, password })

      // Respond with 201 Created and the new user's id.
      res
        .status(201)
        .json({ id: user.id })
    } catch (error) {
      // MongoDB error code 11000 means the unique username already exists.
      if (error.code === 11000) {
        error.status = 409
        error.message = 'The username is already registered.'
      }

      next(error)
    }
  }

  /**
   * Logs in a user and returns a JWT.
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {Function} next - Express next middleware function.
   */
  async login (req, res, next) {
    try {
      const { username, password } = req.body

      assertStrings(username, password)

      // Verify username and password - throws 401 if invalid.
      const user = await UserModel.authenticate(username, password)

      // 'sub' (subject) is the standard JWT claim for the user's id.
      const payload = {
        sub: user.id,
        username: user.username
      }

      // RS256 = signed with the private key, verified with the public key.
      const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
        algorithm: 'RS256',
        expiresIn: process.env.ACCESS_TOKEN_LIFE
      })

      res
        .status(200)
        .json({ 'access-token': accessToken })
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Defines the AuthController class.
 * Handles all logic for the endpoints POST /register and POST /login.
 */

import createError from "http-errors";
import jwt from "jsonwebtoken";
import { UserModel } from "../../models/UserModel.js";

// Only letters, digits, underscores and hyphens. Other characters make it possible to
// pick a name that looks the same as another name, or that changes the direction of the text.
const USERNAME = /^[A-Za-z0-9_-]{3,30}$/;

/**
 * Makes sure the credentials are strings, so that objects such as
 * { "$ne": null } never reach a database query.
 *
 * @param {*} username - The username from the request body.
 * @param {*} password - The password from the request body.
 * @throws {Error} A 400 error if either value is not a string.
 */
function assertStrings (username, password) {
  if (typeof username !== "string" || typeof password !== "string") {
    throw createError(400, "Username and password must be strings.");
  }
}

/**
 * Throws a 403 error if no new accounts are accepted. Registration can be closed with
 * REGISTRATION_OPEN=false, and the number of users is limited by MAX_USERS (100 if not set).
 *
 * @throws {Error} A 403 error.
 */
async function assertRegistrationOpen () {
  const closed = process.env.REGISTRATION_OPEN === "false";
  const maxUsers = Number(process.env.MAX_USERS) || 100;

  if (closed || (await UserModel.estimatedDocumentCount()) >= maxUsers) {
    throw createError(403, "Registration is closed.");
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
      const { username, password } = req.body;

      assertStrings(username, password);

      const name = username.trim();

      if (!USERNAME.test(name)) {
        throw createError(400, "The username must be 3 to 30 letters, digits, underscores or hyphens.");
      }

      await assertRegistrationOpen();

      // A name that only differs in capital letters counts as taken.
      const taken = await UserModel.exists({ username: name }).collation({ locale: "en", strength: 2 });

      if (taken) {
        throw createError(409, "The username is already registered.");
      }

      const user = await UserModel.create({ username: name, password });

      // Respond with 201 Created and the new user's id.
      res
        .status(201)
        .json({ id: user.id });
    } catch (error) {
      // MongoDB error code 11000 means the unique username already exists.
      if (error.code === 11000) {
        error.status = 409;
        error.message = "The username is already registered.";
      }

      next(error);
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
      const { username, password } = req.body;

      assertStrings(username, password);

      // Verify username and password - throws 401 if invalid.
      const user = await UserModel.authenticate(username, password);

      // 'sub' (subject) is the standard JWT claim for the user's id.
      const payload = {
        sub: user.id,
        username: user.username,
      };

      // RS256 = signed with the private key, verified with the public key.
      const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
        algorithm: "RS256",
        expiresIn: process.env.ACCESS_TOKEN_LIFE,
      });

      res
        .status(200)
        .json({ "access-token": accessToken });
    } catch (error) {
      next(error);
    }
  }
}

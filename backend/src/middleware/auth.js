/**
 * Authentication middleware for verifying JWT Tokens.
 * Protects routes by ensuring only authenticated users can access them.
 * THe JWT is verified using the public key from AUTH-SERVICE, meaning no
 * direct communication with AUTH-SERVICE is needed.
 *
 * @author Oliver Woodhouse
 * @version 1.0.1
 */

import jwt from 'jsonwebtoken'

/**
 * Authenticates a request by verifying the JWT in the Authorization header.
 * Extracts the user's id and username from the token payload and adds
 * them to the req.user so controllers can identify who is making the request.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 */
export const authenticateJWT = (req, res, next) => {
  try {
    // Get the authorization header and check if it starts with 'Bearer '.
    const authorization = req.headers.authorization

    if (!authorization || !authorization.startsWith('Bearer ')) {
      const error = new Error('Access token invalid or not provided.')
      error.status = 401
      throw error
    }

    // Extract the token from 'Bearer <token>'.
    const token = authorization.split(' ')[1]

    // Verify the token using the public key from auth-service.
    // If invalid or expired, jwt.verify throws an error.
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_PUBLIC, {
      algorithms: ['RS256']
    })

    // Add the decoded user info to the request object for use in controllers.
    req.user = {
      id: payload.sub,
      username: payload.username
    }

    next()
  } catch (error) {
    // Handle specific JWT errors with a 401 status.
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      error.status = 401
      error.message = 'Access token invalid or not provided.'
    }
    next(error)
  }
}

/**
 * Helper for creating a user and getting an access token.
 */

import jwt from 'jsonwebtoken'
import request from 'supertest'

/**
 * Registers and logs in a user.
 *
 * @param {import('express').Express} app - The application.
 * @param {string} username - The username.
 * @returns {Promise<{ id: string, token: string }>} The user's id and access token.
 */
export async function createUser (app, username) {
  const password = 'correct-horse'

  await request(app).post('/api/v1/auth/register').send({ username, password })
  const res = await request(app).post('/api/v1/auth/login').send({ username, password })

  const token = res.body['access-token']
  return { id: jwt.decode(token).sub, token }
}

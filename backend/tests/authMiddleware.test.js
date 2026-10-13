import { generateKeyPairSync } from 'node:crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import './helpers/silentLogger.js'
import { errorHandler } from '../src/config/errorhandler.js'
import { authenticateJWT } from '../src/middleware/auth.js'

const app = express()
app.get('/protected', authenticateJWT, (req, res) => res.json(req.user))
app.use(errorHandler({ environment: 'test' }))

/**
 * Signs a token with the test private key unless another key is given.
 *
 * @param {object} [options] - Options for jwt.sign, plus an optional key and algorithm.
 * @returns {string} The token.
 */
function signToken ({ key = process.env.ACCESS_TOKEN_SECRET, algorithm = 'RS256', ...options } = {}) {
  return jwt.sign({ username: 'oliver' }, key, {
    algorithm,
    subject: 'user-1',
    expiresIn: '1h',
    ...options
  })
}

describe('authenticateJWT', () => {
  it('accepts a valid token and sets req.user', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${signToken()}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 'user-1', username: 'oliver' })
  })

  it.each([
    ['no Authorization header', () => undefined],
    ['a non-Bearer scheme', () => 'Basic abc123'],
    ['a garbage token', () => 'Bearer not-a-token'],
    ['an expired token', () => `Bearer ${signToken({ expiresIn: -10 })}`],
    [
      'a token signed with another key',
      () => {
        const other = generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        })
        return `Bearer ${signToken({ key: other.privateKey })}`
      }
    ],
    [
      'an HS256 token signed with the public key',
      () => `Bearer ${signToken({ key: process.env.ACCESS_TOKEN_PUBLIC, algorithm: 'HS256' })}`
    ]
  ])('returns 401 for %s', async (name, header) => {
    const req = request(app).get('/protected')
    const value = header()
    const res = value ? await req.set('Authorization', value) : await req

    expect(res.status).toBe(401)
  })
})

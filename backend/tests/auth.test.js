import request from 'supertest'
import jwt from 'jsonwebtoken'
import { UserModel } from '../src/models/UserModel.js'
import { createTestApp } from './helpers/testApp.js'
import {
  startTestDatabase,
  stopTestDatabase,
  clearTestDatabase
} from './helpers/db.js'

const app = createTestApp()
const credentials = { username: 'oliver', password: 'correct-horse' }

/**
 * Registers the default user.
 *
 * @returns {Promise<object>} The response body ({ id }).
 */
async function registerUser () {
  const res = await request(app).post('/api/v1/auth/register').send(credentials)
  return res.body
}

beforeAll(async () => {
  await startTestDatabase()
  await UserModel.init() // Make sure the unique index exists before the first insert.
})

afterAll(stopTestDatabase)
beforeEach(clearTestDatabase)

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})

describe('unknown routes and bad bodies', () => {
  it('returns 404 as JSON', async () => {
    const res = await request(app).get('/nope')

    expect(res.status).toBe(404)
    expect(res.body.status_code).toBe(404)
  })

  it('returns 400 for invalid JSON', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ not json')

    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/auth/register', () => {
  it('creates a user and returns its id', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(credentials)

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ id: expect.any(String) })
  })

  it('stores a hash, not the password', async () => {
    await registerUser()
    const user = await UserModel.findOne({ username: 'oliver' })

    expect(user.password).not.toBe(credentials.password)
    expect(user.password.startsWith('$2')).toBe(true)
  })

  it('never returns the password hash', async () => {
    const { id } = await registerUser()
    const user = await UserModel.findById(id)

    expect(user.toJSON().password).toBeUndefined()
  })

  it('rejects a duplicate username with 409', async () => {
    await registerUser()
    const res = await request(app).post('/api/v1/auth/register').send(credentials)

    expect(res.status).toBe(409)
  })

  it.each([
    ['username too short', { username: 'ab', password: 'correct-horse' }],
    ['username too long', { username: 'x'.repeat(31), password: 'correct-horse' }],
    ['password too short', { username: 'oliver', password: 'short' }],
    ['password too long', { username: 'oliver', password: 'x'.repeat(73) }],
    ['username as object', { username: { $ne: null }, password: 'correct-horse' }],
    ['password as object', { username: 'oliver', password: { $ne: null } }],
    ['missing username', { password: 'correct-horse' }],
    ['missing password', { username: 'oliver' }]
  ])('returns 400 for %s', async (name, body) => {
    const res = await request(app).post('/api/v1/auth/register').send(body)

    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/auth/login', () => {
  it('returns a token with the user id and username', async () => {
    const { id } = await registerUser()
    const res = await request(app).post('/api/v1/auth/login').send(credentials)

    expect(res.status).toBe(200)

    const payload = jwt.verify(res.body['access-token'], process.env.ACCESS_TOKEN_PUBLIC, {
      algorithms: ['RS256']
    })
    expect(payload.sub).toBe(id)
    expect(payload.username).toBe('oliver')
  })

  it('returns the same 401 for a wrong password and an unknown user', async () => {
    await registerUser()
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'oliver', password: 'wrong-password' })
    const unknownUser = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'nobody', password: 'wrong-password' })

    expect(wrongPassword.status).toBe(401)
    expect(unknownUser.status).toBe(401)
    expect(wrongPassword.body.message).toBe(unknownUser.body.message)
  })

  it('returns 400 for a username that is not a string', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: { $ne: null }, password: 'anything-here' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for a password that is not a string', async () => {
    await registerUser()
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'oliver', password: { $ne: null } })

    expect(res.status).toBe(400)
  })

  it('limits the number of attempts', async () => {
    const limited = createTestApp({ authLimit: 3 })
    const attempt = () =>
      request(limited)
        .post('/api/v1/auth/login')
        .send({ username: 'nobody', password: 'wrong-password' })

    for (let i = 0; i < 3; i++) {
      expect((await attempt()).status).toBe(401)
    }

    expect((await attempt()).status).toBe(429)
  })
})

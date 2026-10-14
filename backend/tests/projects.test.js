import request from 'supertest'
import { GlyphModel } from '../src/models/GlyphModel.js'
import { ProjectModel } from '../src/models/ProjectModel.js'
import { UserModel } from '../src/models/UserModel.js'
import { createTestApp } from './helpers/testApp.js'
import { createUser } from './helpers/auth.js'
import { startTestDatabase, stopTestDatabase } from './helpers/db.js'

const app = createTestApp()

let oliver
let anna

/**
 * Builds an Authorization header for a user.
 *
 * @param {{ token: string }} user - The user.
 * @returns {object} The header.
 */
const as = (user) => ({ Authorization: `Bearer ${user.token}` })

/**
 * Creates a project through the API.
 *
 * @param {{ token: string }} user - The user.
 * @param {object} [body] - Fields that override the defaults.
 * @returns {Promise<object>} The response.
 */
const createProject = (user, body = {}) =>
  request(app)
    .post('/api/v1/projects')
    .set(as(user))
    .send({ name: 'My font', gridSize: 32, ...body })

beforeAll(async () => {
  await startTestDatabase()
  await Promise.all([UserModel.init(), ProjectModel.init(), GlyphModel.init()])

  // Users are created once. bcrypt makes creating them slow.
  oliver = await createUser(app, 'oliver')
  anna = await createUser(app, 'annaa')
})

afterAll(stopTestDatabase)

beforeEach(async () => {
  await GlyphModel.deleteMany({})
  await ProjectModel.deleteMany({})
})

describe('authentication', () => {
  it.each([
    ['get', '/api/v1/projects'],
    ['post', '/api/v1/projects'],
    ['get', `/api/v1/projects/${'0'.repeat(24)}`],
    ['patch', `/api/v1/projects/${'0'.repeat(24)}`],
    ['delete', `/api/v1/projects/${'0'.repeat(24)}`]
  ])('requires a token for %s %s', async (method, path) => {
    const res = await request(app)[method](path)

    expect(res.status).toBe(401)
  })
})

describe('POST /api/v1/projects', () => {
  it('creates a project owned by the user', async () => {
    const res = await createProject(oliver)

    expect(res.status).toBe(201)
    expect(res.headers.location).toMatch(new RegExp(`/api/v1/projects/${res.body.id}$`))
    expect(res.body).toMatchObject({
      name: 'My font',
      gridSize: 32,
      margin: 2,
      previewText: '',
      revision: 0,
      glyphCount: 0,
      owner: oliver.id
    })
  })

  it.each([
    [8, 1],
    [16, 1],
    [32, 2],
    [64, 4],
    [128, 8]
  ])('uses the default margin for grid size %i', async (gridSize, margin) => {
    const res = await createProject(oliver, { gridSize })

    expect(res.status).toBe(201)
    expect(res.body.margin).toBe(margin)
  })

  it('keeps a margin that is sent', async () => {
    const res = await createProject(oliver, { margin: 5 })

    expect(res.body.margin).toBe(5)
  })

  it.each([
    ['empty name', { name: '' }],
    ['missing name', { name: undefined }],
    ['name too long', { name: 'x'.repeat(61) }],
    ['name as object', { name: { a: 1 } }],
    ['unsupported grid size', { gridSize: 33 }],
    ['missing grid size', { gridSize: undefined }],
    ['negative margin', { margin: -1 }],
    ['margin that is not a number', { margin: 'abc' }]
  ])('returns 400 for %s', async (name, body) => {
    const res = await createProject(oliver, body)

    expect(res.status).toBe(400)
  })

  it('limits the number of projects per user', async () => {
    await ProjectModel.insertMany(
      Array.from({ length: 50 }, (_, i) => ({
        name: `Font ${i}`,
        owner: oliver.id,
        gridSize: 8,
        margin: 1
      }))
    )

    const res = await createProject(oliver)
    expect(res.status).toBe(403)

    // The limit is per user.
    expect((await createProject(anna)).status).toBe(201)
  })
})

describe('GET /api/v1/projects', () => {
  it('lists only the user\'s own projects, newest change first, without glyph data', async () => {
    const first = await createProject(oliver, { name: 'First' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await createProject(oliver, { name: 'Second' })
    await createProject(anna, { name: 'Annas' })
    await new Promise((resolve) => setTimeout(resolve, 5))

    // Changing the first project moves it to the top.
    await request(app)
      .patch(`/api/v1/projects/${first.body.id}`)
      .set(as(oliver))
      .send({ previewText: 'changed' })

    const res = await request(app).get('/api/v1/projects').set(as(oliver))

    expect(res.status).toBe(200)
    expect(res.body.map((project) => project.name)).toEqual(['First', 'Second'])
    expect(res.body[0]).toEqual({
      id: expect.any(String),
      name: 'First',
      gridSize: 32,
      margin: 2,
      glyphCount: 0,
      revision: 0,
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    })
  })
})

describe('GET /api/v1/projects/:id', () => {
  it('returns the project with no glyphs when none are saved', async () => {
    const { body } = await createProject(oliver)
    const res = await request(app).get(`/api/v1/projects/${body.id}`).set(as(oliver))

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: body.id, name: 'My font', gridSize: 32, glyphs: {} })
    expect(res.body.__v).toBeUndefined()
  })

  it('returns the glyphs in the shape the editor stores', async () => {
    const { body } = await createProject(oliver, { gridSize: 8 })
    const shapes = [{ type: 'rect', cx: 1, cy: 1, w: 2, h: 2, angle: 0 }]

    await GlyphModel.create([
      { project: body.id, char: 'A', bits: 'AAAAAAAAAAA=', shapes, spacing: { left: 128, right: null } },
      { project: body.id, char: '.', bits: 'AAAAAAAAAAA=' }
    ])

    const res = await request(app).get(`/api/v1/projects/${body.id}`).set(as(oliver))

    expect(Object.keys(res.body.glyphs).sort()).toEqual(['.', 'A'])
    expect(res.body.glyphs.A).toEqual({
      size: 8,
      bits: 'AAAAAAAAAAA=',
      shapes,
      spacing: { left: 128, right: null }
    })
    expect(res.body.glyphs['.']).toEqual({
      size: 8,
      bits: 'AAAAAAAAAAA=',
      shapes: [],
      spacing: { left: null, right: null }
    })
  })

  it('does not return glyphs from other projects', async () => {
    const mine = await createProject(oliver)
    const other = await createProject(oliver, { name: 'Other' })
    await GlyphModel.create({ project: other.body.id, char: 'B', bits: 'AAAA' })

    const res = await request(app).get(`/api/v1/projects/${mine.body.id}`).set(as(oliver))

    expect(res.body.glyphs).toEqual({})
  })

  it('returns 404 for another user\'s project', async () => {
    const { body } = await createProject(oliver)
    const res = await request(app).get(`/api/v1/projects/${body.id}`).set(as(anna))

    expect(res.status).toBe(404)
  })

  it.each([
    ['a malformed id', 'not-an-id'],
    ['an id that does not exist', '0'.repeat(24)]
  ])('returns 404 for %s', async (name, id) => {
    const res = await request(app).get(`/api/v1/projects/${id}`).set(as(oliver))

    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/v1/projects/:id', () => {
  it('updates name, margin and preview text, and ignores other fields', async () => {
    const { body } = await createProject(oliver)

    const res = await request(app)
      .patch(`/api/v1/projects/${body.id}`)
      .set(as(oliver))
      .send({
        name: 'Renamed',
        margin: 3,
        previewText: 'Hamburg',
        gridSize: 64,
        owner: anna.id,
        revision: 99
      })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      name: 'Renamed',
      margin: 3,
      previewText: 'Hamburg',
      gridSize: 32,
      owner: oliver.id,
      revision: 0
    })
  })

  it.each([
    ['an empty name', { name: '' }],
    ['a margin that is too large', { margin: 1000 }],
    ['a preview text that is too long', { previewText: 'x'.repeat(501) }]
  ])('returns 400 for %s', async (name, patch) => {
    const { body } = await createProject(oliver)
    const res = await request(app)
      .patch(`/api/v1/projects/${body.id}`)
      .set(as(oliver))
      .send(patch)

    expect(res.status).toBe(400)
  })

  it('returns 404 for another user\'s project and leaves it unchanged', async () => {
    const { body } = await createProject(oliver)
    const res = await request(app)
      .patch(`/api/v1/projects/${body.id}`)
      .set(as(anna))
      .send({ name: 'Stolen' })

    expect(res.status).toBe(404)
    expect((await ProjectModel.findById(body.id)).name).toBe('My font')
  })
})

describe('DELETE /api/v1/projects/:id', () => {
  it('deletes the project and its glyphs, and nothing else', async () => {
    const doomed = await createProject(oliver, { name: 'Doomed' })
    const kept = await createProject(oliver, { name: 'Kept' })
    await GlyphModel.create([
      { project: doomed.body.id, char: 'A', bits: 'AAAA' },
      { project: kept.body.id, char: 'A', bits: 'AAAA' }
    ])

    const res = await request(app)
      .delete(`/api/v1/projects/${doomed.body.id}`)
      .set(as(oliver))

    expect(res.status).toBe(204)
    expect(await ProjectModel.findById(doomed.body.id)).toBeNull()
    expect(await GlyphModel.countDocuments({ project: doomed.body.id })).toBe(0)
    expect(await ProjectModel.findById(kept.body.id)).not.toBeNull()
    expect(await GlyphModel.countDocuments({ project: kept.body.id })).toBe(1)
  })

  it('returns 404 for another user\'s project and deletes nothing', async () => {
    const { body } = await createProject(oliver)
    await GlyphModel.create({ project: body.id, char: 'A', bits: 'AAAA' })

    const res = await request(app).delete(`/api/v1/projects/${body.id}`).set(as(anna))

    expect(res.status).toBe(404)
    expect(await ProjectModel.findById(body.id)).not.toBeNull()
    expect(await GlyphModel.countDocuments({ project: body.id })).toBe(1)
  })
})

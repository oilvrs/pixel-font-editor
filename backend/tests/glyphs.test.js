import request from 'supertest'
import { createGrid, getPixel, setPixel } from '../../frontend/src/core/grid.js'
import { deserializeGlyph, noSpacing, serializeGlyph } from '../../frontend/src/core/glyph.js'
import { GlyphModel } from '../src/models/GlyphModel.js'
import { ProjectModel } from '../src/models/ProjectModel.js'
import { UserModel } from '../src/models/UserModel.js'
import { createTestApp } from './helpers/testApp.js'
import { createUser } from './helpers/auth.js'
import { startTestDatabase, stopTestDatabase } from './helpers/db.js'

const app = createTestApp()

const RECT = { type: 'rect', cx: 4, cy: 4, w: 2, h: 2, angle: 0 }

let oliver
let anna
let project

/**
 * Builds an Authorization header for a user.
 *
 * @param {{ token: string }} user - The user.
 * @returns {object} The header.
 */
const as = (user) => ({ Authorization: `Bearer ${user.token}` })

/**
 * Builds a glyph in the format the editor sends, using the editor's own code.
 *
 * @param {number} [size] - The grid size.
 * @param {number[][]} [pixels] - The [x, y] cells to fill.
 * @param {object} [options] - Shapes and spacing.
 * @returns {object} { size, bits, shapes?, spacing? }
 */
function makeGlyph (size = 32, pixels = [[1, 1]], { shapes = [], spacing = noSpacing() } = {}) {
  const grid = createGrid(size)
  for (const [x, y] of pixels) {
    setPixel(grid, x, y, 1)
  }
  return serializeGlyph({ grid, shapes, spacing })
}

const emptyGlyph = (size = 32) => makeGlyph(size, [])

/**
 * Saves a batch of glyphs.
 *
 * @param {{ token: string }} user - The user.
 * @param {string} id - The project id.
 * @param {object} body - The request body.
 * @returns {Promise<object>} The response.
 */
const save = (user, id, body) =>
  request(app).put(`/api/v1/projects/${id}/glyphs`).set(as(user)).send(body)

/**
 * Loads the test project through the API.
 *
 * @returns {Promise<object>} The response body.
 */
const load = async () =>
  (await request(app).get(`/api/v1/projects/${project.id}`).set(as(oliver))).body

beforeAll(async () => {
  await startTestDatabase()
  await Promise.all([UserModel.init(), ProjectModel.init(), GlyphModel.init()])

  oliver = await createUser(app, 'oliver')
  anna = await createUser(app, 'annaa')
})

afterAll(stopTestDatabase)

beforeEach(async () => {
  await GlyphModel.deleteMany({})
  await ProjectModel.deleteMany({})
  project = await ProjectModel.create({
    name: 'Test font',
    owner: oliver.id,
    gridSize: 32,
    margin: 2
  })
})

describe('PUT /api/v1/projects/:id/glyphs', () => {
  it('requires a token', async () => {
    const res = await request(app)
      .put(`/api/v1/projects/${project.id}/glyphs`)
      .send({ baseRevision: 0, upserts: { A: makeGlyph() } })

    expect(res.status).toBe(401)
  })

  describe('saving', () => {
    it('saves glyphs and returns them in the stored shape', async () => {
      const a = makeGlyph(32, [[1, 1], [2, 2]], { shapes: [RECT], spacing: { left: 128, right: null } })
      const b = makeGlyph(32, [[5, 5]])

      const res = await save(oliver, project.id, { baseRevision: 0, upserts: { A: a, B: b } })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ revision: 1, glyphCount: 2 })

      const loaded = await load()
      expect(loaded).toMatchObject({ revision: 1, glyphCount: 2 })
      expect(loaded.glyphs.A).toEqual(a)
      expect(loaded.glyphs.B).toEqual({ ...b, shapes: [], spacing: { left: null, right: null } })
    })

    it('returns glyphs that the editor code can restore', async () => {
      const a = makeGlyph(32, [[1, 1], [2, 2]], { shapes: [RECT], spacing: { left: 128, right: null } })
      await save(oliver, project.id, { baseRevision: 0, upserts: { A: a } })

      const restored = deserializeGlyph((await load()).glyphs.A)

      expect(getPixel(restored.grid, 1, 1)).toBe(1)
      expect(getPixel(restored.grid, 2, 2)).toBe(1)
      expect(getPixel(restored.grid, 0, 0)).toBe(0)
      expect(restored.shapes).toEqual([RECT])
      expect(restored.spacing).toEqual({ left: 128, right: null })
    })

    it('updates an existing glyph without adding a new one', async () => {
      await save(oliver, project.id, { baseRevision: 0, upserts: { A: makeGlyph(32, [[1, 1]]) } })
      const changed = makeGlyph(32, [[9, 9]])

      const res = await save(oliver, project.id, { baseRevision: 1, upserts: { A: changed } })

      expect(res.body).toMatchObject({ revision: 2, glyphCount: 1 })
      expect((await load()).glyphs.A.bits).toBe(changed.bits)
    })

    it('deletes glyphs, and ignores characters that were never saved', async () => {
      await save(oliver, project.id, { baseRevision: 0, upserts: { A: makeGlyph(), B: makeGlyph() } })

      const res = await save(oliver, project.id, { baseRevision: 1, deletes: ['A', 'Z'] })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ revision: 2, glyphCount: 1 })
      expect(Object.keys((await load()).glyphs)).toEqual(['B'])
    })

    it('treats an empty glyph as a delete', async () => {
      await save(oliver, project.id, { baseRevision: 0, upserts: { A: makeGlyph() } })

      const res = await save(oliver, project.id, { baseRevision: 1, upserts: { A: emptyGlyph() } })

      expect(res.body).toMatchObject({ revision: 2, glyphCount: 0 })
      expect(await GlyphModel.countDocuments({ project: project.id })).toBe(0)
    })

    it('stores nothing for an empty glyph, even with spacing', async () => {
      const spacingOnly = { ...emptyGlyph(), spacing: { left: 128, right: null } }

      const res = await save(oliver, project.id, {
        baseRevision: 0,
        upserts: { A: emptyGlyph(), B: spacingOnly }
      })

      expect(res.status).toBe(200)
      expect(res.body.glyphCount).toBe(0)
      expect(await GlyphModel.countDocuments({ project: project.id })).toBe(0)
    })

    it('saves characters that are awkward as object keys', async () => {
      const chars = ['.', '$', '\\', '"', 'å', '€']
      const upserts = Object.fromEntries(chars.map((char, i) => [char, makeGlyph(32, [[i, i]])]))

      const res = await save(oliver, project.id, { baseRevision: 0, upserts })

      expect(res.status).toBe(200)
      const loaded = await load()
      expect(Object.keys(loaded.glyphs).sort()).toEqual([...chars].sort())
      expect(loaded.glyphs['.'].bits).toBe(upserts['.'].bits)
    })

    it('leaves the glyphs of other projects alone', async () => {
      const other = await ProjectModel.create({
        name: 'Other',
        owner: oliver.id,
        gridSize: 32,
        margin: 2
      })
      await GlyphModel.create({ project: other.id, char: 'A', bits: 'x' })

      await save(oliver, project.id, { baseRevision: 0, upserts: { A: makeGlyph() } })
      await save(oliver, project.id, { baseRevision: 1, deletes: ['A'] })

      expect(await GlyphModel.countDocuments({ project: other.id })).toBe(1)
    })
  })

  describe('conflicts', () => {
    it('rejects a stale baseRevision and saves nothing', async () => {
      await save(oliver, project.id, { baseRevision: 0, upserts: { A: makeGlyph() } })

      const res = await save(oliver, project.id, { baseRevision: 0, upserts: { B: makeGlyph() } })

      expect(res.status).toBe(409)
      const loaded = await load()
      expect(loaded.revision).toBe(1)
      expect(Object.keys(loaded.glyphs)).toEqual(['A'])
    })

    it('rejects a baseRevision from the future', async () => {
      const res = await save(oliver, project.id, { baseRevision: 5, upserts: { A: makeGlyph() } })

      expect(res.status).toBe(409)
      expect(await GlyphModel.countDocuments({ project: project.id })).toBe(0)
    })

    it('lets only one of two simultaneous saves win', async () => {
      const [first, second] = await Promise.all([
        save(oliver, project.id, { baseRevision: 0, upserts: { A: makeGlyph() } }),
        save(oliver, project.id, { baseRevision: 0, upserts: { B: makeGlyph() } })
      ])

      expect([first.status, second.status].sort()).toEqual([200, 409])
      expect((await load()).revision).toBe(1)
      expect(await GlyphModel.countDocuments({ project: project.id })).toBe(1)
    })
  })

  describe('validation', () => {
    const glyph = makeGlyph()

    it.each([
      ['a missing baseRevision', () => ({ upserts: { A: glyph } })],
      ['a baseRevision that is a string', () => ({ baseRevision: '0', upserts: { A: glyph } })],
      ['a baseRevision that is not a whole number', () => ({ baseRevision: 1.5, upserts: { A: glyph } })],
      ['a negative baseRevision', () => ({ baseRevision: -1, upserts: { A: glyph } })],
      ['upserts as an array', () => ({ baseRevision: 0, upserts: [glyph] })],
      ['upserts as null', () => ({ baseRevision: 0, upserts: null })],
      ['deletes that is not an array', () => ({ baseRevision: 0, deletes: 'A' })],
      ['nothing to save', () => ({ baseRevision: 0 })],
      ['empty lists', () => ({ baseRevision: 0, upserts: {}, deletes: [] })],
      ['a character outside the glyph set', () => ({ baseRevision: 0, upserts: { Ж: glyph } })],
      ['a space', () => ({ baseRevision: 0, upserts: { ' ': glyph } })],
      ['a key with several characters', () => ({ baseRevision: 0, upserts: { AB: glyph } })],
      ['an unknown character in deletes', () => ({ baseRevision: 0, deletes: ['Ж'] })],
      ['a delete that is not a string', () => ({ baseRevision: 0, deletes: [1] })],
      ['a character that is both saved and deleted', () => ({ baseRevision: 0, upserts: { A: glyph }, deletes: ['A'] })],
      ['too many entries', () => ({ baseRevision: 0, deletes: Array(205).fill('A') })],
      ['a glyph that is a string', () => ({ baseRevision: 0, upserts: { A: 'nope' } })],
      ['a glyph that is null', () => ({ baseRevision: 0, upserts: { A: null } })],
      ['a glyph that is an array', () => ({ baseRevision: 0, upserts: { A: [] } })],
      ['a glyph with the wrong grid size', () => ({ baseRevision: 0, upserts: { A: makeGlyph(16) } })],
      ['bits that is not a string', () => ({ baseRevision: 0, upserts: { A: { ...glyph, bits: 123 } } })],
      ['bits that is too short', () => ({ baseRevision: 0, upserts: { A: { ...glyph, bits: glyph.bits.slice(0, 20) } } })],
      ['bits with invalid characters', () => ({ baseRevision: 0, upserts: { A: { ...glyph, bits: '!'.repeat(glyph.bits.length) } } })],
      ['bits with extra whitespace', () => ({ baseRevision: 0, upserts: { A: { ...glyph, bits: `${glyph.bits}\n` } } })],
      ['one valid and one invalid glyph', () => ({ baseRevision: 0, upserts: { A: glyph, B: makeGlyph(16) } })]
    ])('returns 400 for %s and saves nothing', async (name, build) => {
      const res = await save(oliver, project.id, build())

      expect(res.status).toBe(400)
      expect((await ProjectModel.findById(project.id)).revision).toBe(0)
      expect(await GlyphModel.countDocuments({ project: project.id })).toBe(0)
    })
  })

  describe('cleaning', () => {
    it('drops invalid shapes and extra fields, and rounds spacing', async () => {
      const dirty = {
        ...makeGlyph(),
        shapes: [
          { ...RECT, evil: { $where: '1' } },
          { type: 'bogus', cx: 1, cy: 1, w: 2, h: 2, angle: 0 },
          'junk'
        ],
        spacing: { left: 10.4, right: 'x' }
      }

      const res = await save(oliver, project.id, { baseRevision: 0, upserts: { A: dirty } })

      expect(res.status).toBe(200)
      const stored = (await load()).glyphs.A
      expect(stored.shapes).toEqual([RECT])
      expect(stored.spacing).toEqual({ left: 10, right: null })
    })
  })

  describe('ownership', () => {
    it('returns 404 for another user\'s project and saves nothing', async () => {
      const res = await save(anna, project.id, { baseRevision: 0, upserts: { A: makeGlyph() } })

      expect(res.status).toBe(404)
      expect(await GlyphModel.countDocuments()).toBe(0)
    })

    it('returns 404 for a malformed project id', async () => {
      const res = await save(oliver, 'not-an-id', { baseRevision: 0, upserts: { A: makeGlyph() } })

      expect(res.status).toBe(404)
    })
  })
})

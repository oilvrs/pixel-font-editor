import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, setPixel } from '../src/core/grid.js'
import { noSpacing, serializeGlyph } from '../src/core/glyph.js'
import { buildBatch, reconcilePending, retryDelay } from '../src/core/sync.js'

const RECT = { type: 'rect', cx: 4, cy: 4, w: 2, h: 2, angle: 0 }

/**
 * Makes a glyph in the editor's own model.
 * @param {number[][]} cells - the [x, y] cells to fill
 * @param {Object} options - { shapes, spacing }
 * @returns {Object} { grid, shapes, spacing }
 */
function makeGlyph(cells = [[1, 1]], { shapes = [], spacing = noSpacing() } = {}) {
  const grid = createGrid(8)
  for (const [x, y] of cells) setPixel(grid, x, y, 1)
  return { grid, shapes, spacing }
}

/**
 * A glyph as the server returns it: shapes and spacing are always there.
 * @param {Object} glyph
 * @returns {Object}
 */
function served(glyph) {
  const data = serializeGlyph(glyph)
  return {
    ...data,
    shapes: data.shapes ?? [],
    spacing: data.spacing ?? { left: null, right: null },
  }
}

const pending = (glyphs, baseRevision, maybeRevision = null) => ({
  baseRevision,
  maybeRevision,
  glyphs,
  meta: {},
})

test('retryDelay grows and then stays at one minute', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 50].map(retryDelay),
    [2000, 2000, 5000, 10000, 30000, 60000, 60000, 60000]
  )
})

test('buildBatch saves drawn glyphs and deletes empty and missing ones', () => {
  const glyphs = {
    A: makeGlyph(),
    B: makeGlyph([]),
    C: makeGlyph([], { spacing: { left: 128, right: null } }),
    D: makeGlyph([], { shapes: [RECT] }),
  }

  const batch = buildBatch(['A', 'B', 'C', 'D', 'Z'], (char) => glyphs[char], 7)

  assert.equal(batch.baseRevision, 7)
  assert.deepEqual(Object.keys(batch.upserts).sort(), ['A', 'D'])
  assert.deepEqual(batch.upserts.A, serializeGlyph(glyphs.A))
  assert.deepEqual(batch.deletes.sort(), ['B', 'C', 'Z'])
})

test('reconcilePending returns none when nothing is pending', () => {
  assert.equal(reconcilePending(null, { revision: 1, glyphs: {} }), 'none')
  assert.equal(reconcilePending(pending({}, 1), { revision: 1, glyphs: {} }), 'none')
})

test('reconcilePending drops changes that the server already has', () => {
  const a = makeGlyph()

  assert.equal(
    reconcilePending(pending({ A: serializeGlyph(a) }, 1), {
      revision: 2,
      glyphs: { A: served(a) },
    }),
    'drop'
  )
})

test('reconcilePending drops a delete of a glyph the server does not have', () => {
  assert.equal(reconcilePending(pending({ A: null }, 1), { revision: 5, glyphs: {} }), 'drop')
})

test('reconcilePending applies changes when the project is at the base revision', () => {
  const newer = makeGlyph([[2, 2]])
  const older = makeGlyph([[1, 1]])

  assert.equal(
    reconcilePending(pending({ A: serializeGlyph(newer) }, 3), {
      revision: 3,
      glyphs: { A: served(older) },
    }),
    'apply'
  )
  assert.equal(
    reconcilePending(pending({ A: null }, 3), { revision: 3, glyphs: { A: served(older) } }),
    'apply'
  )
})

test('reconcilePending applies changes when a save that was under way went through', () => {
  const newer = makeGlyph([[2, 2]])
  const older = makeGlyph([[1, 1]])

  assert.equal(
    reconcilePending(pending({ A: serializeGlyph(newer) }, 3, 4), {
      revision: 4,
      glyphs: { A: served(older) },
    }),
    'apply'
  )
})

test('reconcilePending reports a conflict when the project was changed elsewhere', () => {
  const mine = makeGlyph([[2, 2]])
  const theirs = makeGlyph([[3, 3]])

  assert.equal(
    reconcilePending(pending({ A: serializeGlyph(mine) }, 3), {
      revision: 5,
      glyphs: { A: served(theirs) },
    }),
    'conflict'
  )
  assert.equal(
    reconcilePending(pending({ A: null }, 3), { revision: 5, glyphs: { A: served(theirs) } }),
    'conflict'
  )
})

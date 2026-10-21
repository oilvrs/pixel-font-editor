import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, setPixel } from '../src/core/grid.js'
import { noSpacing } from '../src/core/glyph.js'
import { layoutText, missingWidth } from '../src/core/layout.js'
import { layoutThumbnail } from '../src/core/thumbnail.js'

const SIZE = 8
const OPTIONS = { size: SIZE, margin: 1 }

/**
 * Makes a glyph in the editor's own model.
 * @param {number[][]} cells - the [x, y] cells to fill
 * @returns {Object} { grid, shapes, spacing }
 */
function makeGlyph(cells) {
  const grid = createGrid(SIZE)
  for (const [x, y] of cells) setPixel(grid, x, y, 1)
  return { grid, shapes: [], spacing: noSpacing() }
}

const glyphs = {
  A: makeGlyph([
    [1, 1],
    [2, 2],
  ]),
  b: makeGlyph([[3, 3]]),
  B: makeGlyph([
    [1, 1],
    [1, 2],
    [2, 2],
  ]),
}

test('without missing glyphs the layout is the same as layoutText', () => {
  const getGlyph = (char) => glyphs[char] ?? null

  const plain = layoutText('Ab Bb', getGlyph, OPTIONS)
  const thumbnail = layoutThumbnail('Ab Bb', getGlyph, OPTIONS, () => 99)

  assert.deepEqual(thumbnail, plain)
})

test('a missing glyph gets the width from measure', () => {
  const getGlyph = (char) => (char === 'A' ? glyphs.A : null)

  const plain = layoutText('Ab', getGlyph, OPTIONS)
  const thumbnail = layoutThumbnail('Ab', getGlyph, OPTIONS, () => 10)
  const [a, b] = thumbnail.items

  assert.equal(a.missing, false)
  assert.equal(b.missing, true)
  assert.equal(b.x, plain.items[1].x)
  assert.equal(b.advance, 10)
  assert.equal(thumbnail.width, plain.width - missingWidth(SIZE) + 10)
})

test('everything after a missing glyph moves by the difference', () => {
  // Only B is drawn, so A, b and the last b are missing.
  const getGlyph = (char) => (char === 'B' ? glyphs.B : null)
  const widths = { A: 6, b: 5 }

  const plain = layoutText('Ab Bb', getGlyph, OPTIONS)
  const thumbnail = layoutThumbnail('Ab Bb', getGlyph, OPTIONS, (char) => widths[char])

  const gap = missingWidth(SIZE)
  const shiftBeforeB = 6 - gap + (5 - gap)
  const shiftTotal = shiftBeforeB + (5 - gap)

  const plainB = plain.items.find((item) => item.char === 'B')
  const thumbnailB = thumbnail.items.find((item) => item.char === 'B')

  assert.equal(thumbnailB.x, plainB.x + shiftBeforeB)
  assert.equal(thumbnail.width, plain.width + shiftTotal)
})

test('the items keep their order, and the height is the same', () => {
  const getGlyph = (char) => (char === 'A' ? glyphs.A : null)

  const plain = layoutText('Ab Bb', getGlyph, OPTIONS)
  const thumbnail = layoutThumbnail('Ab Bb', getGlyph, OPTIONS, () => 7)

  assert.deepEqual(
    thumbnail.items.map((item) => item.char),
    plain.items.map((item) => item.char)
  )
  assert.equal(thumbnail.height, plain.height)
})

test('a line where nothing is drawn is set entirely in the other font', () => {
  const thumbnail = layoutThumbnail(
    'Ab Bb',
    () => null,
    OPTIONS,
    () => 5
  )

  assert.ok(thumbnail.items.every((item) => item.missing && item.advance === 5))
})
